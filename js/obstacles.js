/**
 * obstacles.js — IIFE on window.NEON.Obstacles
 *
 * Responsibilities:
 *   - Spawn horizontal block/cactus obstacles off-screen right, move them left
 *   - Different sizes (width × height) for variety
 *   - Difficulty ramp adjusts spawn interval over elapsed time
 *   - AABB collision detection against player bounds
 *   - Cleanup when obstacles exit the screen left
 *
 * Each obstacle is a single rectangle sitting on the ground platform.
 * Drawing is delegated to NEON.Render.drawObstacles().
 *
 * Design contracts:
 *   NEON.Obstacles = { init(), reset(), resize(), update(dt, speed), draw(),
 *                      checkCollision(playerBounds) }
 */
window.NEON = window.NEON || {};

window.NEON.Obstacles = (function () {
  'use strict';

  /* ---- constants ---- */
  var COLOR             = '#ff00ff';    // magenta — contrast against cyan player
  var MIN_HEIGHT        = 20;          // minimum obstacle height (px)
  var MAX_HEIGHT        = 50;          // maximum obstacle height (px)
  var MIN_WIDTH         = 15;          // minimum obstacle width (px)
  var MAX_WIDTH         = 30;          // maximum obstacle width (px)
  var SPAWN_EASY        = 2.0;         // seconds between spawns (easy)
  var SPAWN_MEDIUM      = 1.4;         // seconds between spawns (medium)
  var SPAWN_HARD        = 0.9;         // seconds between spawns (hard)
  var DIFFICULTY_MEDIUM_AT = 25;       // switch to medium after 25 s
  var DIFFICULTY_HARD_AT   = 55;       // switch to hard after 55 s

  /* ---- internal state ---- */
  var obstacles = [];         // array of obstacle objects { x, y, width, height, color }
  var spawnTimer = 0;         // countdown to next spawn (seconds)
  var elapsed = 0;            // total elapsed time for difficulty ramp
  var difficulty = 'easy';    // current difficulty tier
  var spawnInterval;          // current spawn interval (seconds)
  var canvasWidth, canvasHeight;
  var groundY;                // Y coordinate of the ground platform top

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

  /* ---- spawning ---- */

  function _spawnObstacle() {
    var h = MIN_HEIGHT + Math.random() * (MAX_HEIGHT - MIN_HEIGHT);
    var w = MIN_WIDTH  + Math.random() * (MAX_WIDTH  - MIN_WIDTH);

    obstacles.push({
      x: canvasWidth,          // spawn just off the right edge
      y: groundY - h,          // sit on top of the ground platform
      width: w,
      height: h,
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
   * Discovers the canvas to know spawn boundaries and ground level.
   * Must be called once after Render.init().
   */
  function init() {
    var canvas = document.getElementById('gameCanvas');
    if (!canvas) {
      console.error('Obstacles.init: canvas element #gameCanvas not found');
      return;
    }
    canvasWidth  = canvas.width;
    canvasHeight = canvas.height;
    groundY      = canvasHeight * 0.85;

    reset();
  }

  /**
   * Reset all obstacle state (on game restart).
   */
  function reset() {
    obstacles    = [];
    spawnTimer   = 0;
    elapsed      = 0;
    difficulty   = 'easy';
    spawnInterval = SPAWN_EASY;

    // Re-read canvas dimensions in case of resize
    var canvas = document.getElementById('gameCanvas');
    if (canvas) {
      canvasWidth  = canvas.width;
      canvasHeight = canvas.height;
      groundY      = canvasHeight * 0.85;
    }
  }

  /**
   * Update obstacle positions and ground level to match canvas resize.
   * Called from main.js's window resize handler.
   */
  function resize() {
    var canvas = document.getElementById('gameCanvas');
    if (!canvas) return;
    canvasWidth  = canvas.width;
    canvasHeight = canvas.height;
    groundY      = canvasHeight * 0.85;
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
      if (obstacles[i].x + obstacles[i].width < 0) {
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
   * Each obstacle is a single rectangle — no wall/gap splitting needed.
   */
  function draw() {
    NEON.Render.drawObstacles(obstacles);
  }

  /**
   * Check whether the player's bounds collide with ANY active obstacle.
   * Simple AABB test against each obstacle's single bounding rect.
   *
   * @param {{x:number, y:number, w:number, h:number}} playerBounds
   * @returns {boolean}  true if a collision was detected
   */
  function checkCollision(playerBounds) {
    if (!playerBounds) return false;

    for (var i = 0; i < obstacles.length; i++) {
      var o = obstacles[i];
      if (aabb(playerBounds, {
        x: o.x, y: o.y,
        w: o.width, h: o.height
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
    resize: resize,
    update: update,
    draw: draw,
    checkCollision: checkCollision
  };
})();
