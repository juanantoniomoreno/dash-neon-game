/**
 * obstacles.js — IIFE on window.NEON.Obstacles
 *
 * Responsibilities:
 *   - Spawn neon-wall obstacles off-screen right, move them left
 *   - Gap patterns selected by difficulty tier (easy / medium / hard)
 *   - AABB collision detection against player bounds
 *   - Cleanup when obstacles exit the screen left
 *
 * Each obstacle is a vertical wall with a gap at a specific Y.
 * It is split into two AABB rects for collision: top portion and
 * bottom portion. Drawing is delegated to NEON.Render.drawObstacles().
 *
 * Design contracts:
 *   NEON.Obstacles = { init(), update(dt, speed), draw(),
 *                      checkCollision(playerBounds), reset() }
 */
window.NEON = window.NEON || {};

window.NEON.Obstacles = (function () {
  'use strict';

  /* ---- constants ---- */
  var WALL_WIDTH    = 20;             // width of a neon wall bar
  var COLOR         = '#ff00ff';      // magenta — contrast against cyan player
  var GAP_EASY      = 90;             // gap height for easy tier
  var GAP_MEDIUM    = 60;             // gap height for medium tier
  var GAP_HARD      = 45;             // gap height for hard tier
  var SPAWN_EASY    = 2.0;            // seconds between spawns (easy)
  var SPAWN_MEDIUM  = 1.4;            // seconds between spawns (medium)
  var SPAWN_HARD    = 0.9;            // seconds between spawns (hard)
  var DIFFICULTY_MEDIUM_AT = 25;      // switch to medium after 25 s
  var DIFFICULTY_HARD_AT   = 55;      // switch to hard after 55 s

  /* ---- internal state ---- */
  var obstacles = [];         // array of obstacle-group objects
  var spawnTimer = 0;         // countdown to next spawn (seconds)
  var elapsed = 0;            // total elapsed time for difficulty ramp
  var difficulty = 'easy';    // current difficulty tier
  var spawnInterval;          // current spawn interval (seconds)
  var canvasWidth, canvasHeight;

  /* ---- AABB helper ---- */

  /**
   * Axis-Aligned Bounding Box overlap test.
   *
   * @param {{x:number, y:number, w:number, h:number}} a
   * @param {{x:number, y:number, w:number, h:number}} b
   * @returns {boolean}
   */
  function aabb(a, b) {
    return a.x < b.x + b.w &&
           a.x + a.w > b.x &&
           a.y < b.y + b.h &&
           a.y + a.h > b.y;
  }

  /* ---- gap Y generation by difficulty ---- */

  /**
   * Easy: generous gap. 60 % chance it includes the player's Y lane.
   * @param {number} playerY  Player's current Y position
   * @returns {number}  Top Y coordinate of the gap
   */
  function _gapEasy(playerY) {
    if (Math.random() < 0.6) {
      // Gap centred around player lane
      return playerY - GAP_EASY / 2 +
             (Math.random() - 0.5) * GAP_EASY * 0.6;
    }
    // Random position on screen
    return Math.random() * (canvasHeight - GAP_EASY);
  }

  /**
   * Medium: tighter gap. 40 % chance near player lane.
   * @param {number} playerY
   * @returns {number}
   */
  function _gapMedium(playerY) {
    if (Math.random() < 0.4) {
      return playerY - GAP_MEDIUM / 2 +
             (Math.random() - 0.5) * GAP_MEDIUM * 0.4;
    }
    return Math.random() * (canvasHeight - GAP_MEDIUM);
  }

  /**
   * Hard: very tight gap, rarely near player lane.
   * Alternates between "high" and "low" patterns (staggered).
   * @param {number} playerY
   * @returns {number}
   */
  function _gapHard(playerY) {
    // 20 % chance it includes the player lane
    if (Math.random() < 0.2) {
      return playerY - GAP_HARD / 2 +
             (Math.random() - 0.5) * GAP_HARD * 0.3;
    }
    // Staggered: alternate between upper third and lower third
    if (obstacles.length % 2 === 0) {
      // Upper gap
      return Math.random() * (canvasHeight * 0.33 - GAP_HARD);
    }
    // Lower gap
    return canvasHeight * 0.55 +
           Math.random() * (canvasHeight * 0.45 - GAP_HARD);
  }

  /* ---- spawning ---- */

  function _spawnObstacle() {
    // Get player Y from the Player module (loaded before us)
    var playerY = NEON.Player.y;
    if (playerY === undefined) playerY = canvasHeight / 2;

    var gapY;

    switch (difficulty) {
      case 'hard':
        gapY = _gapHard(playerY);
        break;
      case 'medium':
        gapY = _gapMedium(playerY);
        break;
      default: // easy
        gapY = _gapEasy(playerY);
    }

    // Clamp gap to canvas bounds
    gapY = Math.max(0, Math.min(gapY, canvasHeight - GAP_EASY));

    obstacles.push({
      x: canvasWidth,           // spawn just off the right edge
      gapY: gapY,
      gapHeight: difficulty === 'hard' ? GAP_HARD :
                  difficulty === 'medium' ? GAP_MEDIUM : GAP_EASY,
      color: COLOR
    });
  }

  /**
   * Update difficulty tier based on elapsed time.
   * Adjusts spawn interval and sets the tier label.
   */
  function _updateDifficulty() {
    if (elapsed >= DIFFICULTY_HARD_AT) {
      difficulty = 'hard';
      spawnInterval = SPAWN_HARD;
    } else if (elapsed >= DIFFICULTY_MEDIUM_AT) {
      difficulty = 'medium';
      spawnInterval = SPAWN_MEDIUM;
    } else {
      difficulty = 'easy';
      spawnInterval = SPAWN_EASY;
    }
  }

  /* ---- public API ---- */

  /**
   * Initialise the obstacle manager.
   * Discovers the canvas to know spawn boundaries.
   * Must be called once after Render.init().
   */
  function init() {
    var canvas = document.getElementById('gameCanvas');
    if (!canvas) {
      console.error('Obstacles.init: canvas element #gameCanvas not found');
      return;
    }
    canvasWidth = canvas.width;
    canvasHeight = canvas.height;

    reset();
  }

  /**
   * Reset all obstacle state (on game restart).
   */
  function reset() {
    obstacles = [];
    spawnTimer = 0;
    elapsed = 0;
    difficulty = 'easy';
    spawnInterval = SPAWN_EASY;

    // Re-read canvas dimensions in case of resize
    var canvas = document.getElementById('gameCanvas');
    if (canvas) {
      canvasWidth = canvas.width;
      canvasHeight = canvas.height;
    }
  }

  /**
   * Per-frame update.
   * Moves obstacles left, spawns new ones, and cleans up expired ones.
   *
   * @param {number} dt     Delta time in seconds (capped at 0.05)
   * @param {number} speed  Game speed (px/s) — passed from main loop
   */
  function update(dt, speed) {
    // Ramp difficulty
    elapsed += dt;
    _updateDifficulty();

    // ---- move obstacles left ----
    for (var i = obstacles.length - 1; i >= 0; i--) {
      obstacles[i].x -= speed * dt;

      // Cleanup: obstacle fully off the left edge
      if (obstacles[i].x + WALL_WIDTH < 0) {
        obstacles.splice(i, 1);
      }
    }

    // ---- spawn new obstacles ----
    spawnTimer -= dt;
    if (spawnTimer <= 0) {
      _spawnObstacle();
      spawnTimer = spawnInterval;
    }
  }

  /**
   * Draw all active obstacles by delegating to NEON.Render.
   * Each obstacle group is flattened into two rects (top + bottom walls)
   * before being passed to the renderer.
   */
  function draw() {
    var rects = [];

    for (var i = 0; i < obstacles.length; i++) {
      var o = obstacles[i];
      var bottomY = o.gapY + o.gapHeight;

      // Top wall: from top of screen to gap start
      rects.push({
        x: o.x,
        y: 0,
        width: WALL_WIDTH,
        height: o.gapY,
        color: o.color
      });

      // Bottom wall: from gap end to bottom of screen
      rects.push({
        x: o.x,
        y: bottomY,
        width: WALL_WIDTH,
        height: canvasHeight - bottomY,
        color: o.color
      });
    }

    NEON.Render.drawObstacles(rects);
  }

  /**
   * Check whether the player's bounds collide with ANY active obstacle.
   * Each obstacle is split into two rects: the wall above the gap
   * and the wall below the gap.
   *
   * @param {{x:number, y:number, w:number, h:number}} playerBounds
   * @returns {boolean}  true if a collision was detected
   */
  function checkCollision(playerBounds) {
    if (!playerBounds) return false;

    for (var i = 0; i < obstacles.length; i++) {
      var o = obstacles[i];

      // Check top wall
      if (aabb(playerBounds, {
        x: o.x, y: 0,
        w: WALL_WIDTH, h: o.gapY
      })) {
        return true;
      }

      // Check bottom wall
      var bottomY = o.gapY + o.gapHeight;
      if (aabb(playerBounds, {
        x: o.x, y: bottomY,
        w: WALL_WIDTH, h: canvasHeight - bottomY
      })) {
        return true;
      }
    }

    return false;
  }

  /* ---- public exports ---- */
  return {
    init: init,
    reset: reset,
    update: update,
    draw: draw,
    checkCollision: checkCollision
  };
})();
