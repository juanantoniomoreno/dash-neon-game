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

  /**
   * Spawn a new obstacle.
   *
   * If weights are provided (from the zone system), a weighted random selection
   * determines the obstacle type. Otherwise falls back to the old behaviour
   * (all blocks).
   *
   * Obstacle types:
   *   'block'  — standard rectangle, w 15–30 × h 20–50
   *   'pillar' — tall and thin, w 10–15 × h 50–80
   *   'wide'   — long and low, w 60–90 × h 18–25
   *   'double' — two stacked rects with a 10–14px gap in between
   *
   * @param {object} [weights]  Optional spawn weight map (e.g. { block: 0.6, pillar: 0.2, ... })
   */
  function _spawnObstacle(weights) {
    var type;

    if (weights) {
      // Weighted random selection
      var keys = [];
      var cumulative = [];
      var total = 0;

      for (var key in weights) {
        if (weights.hasOwnProperty(key)) {
          keys.push(key);
          total += weights[key];
          cumulative.push(total);
        }
      }

      if (total > 0) {
        var rand = Math.random() * total;
        for (var i = 0; i < cumulative.length; i++) {
          if (rand <= cumulative[i]) {
            type = keys[i];
            break;
          }
        }
      }
    }

    // Fallback: all blocks
    if (!type) {
      type = 'block';
    }

    var h, w;

    switch (type) {
      case 'pillar':
        w = 10 + Math.random() * 5;    // 10–15
        h = 50 + Math.random() * 30;   // 50–80
        obstacles.push({
          x: canvasWidth,
          y: groundY - h,
          width: w,
          height: h,
          color: COLOR,
          type: 'pillar'
        });
        break;

      case 'wide':
        w = 60 + Math.random() * 30;   // 60–90
        h = 18 + Math.random() * 7;    // 18–25
        obstacles.push({
          x: canvasWidth,
          y: groundY - h,
          width: w,
          height: h,
          color: COLOR,
          type: 'wide'
        });
        break;

      case 'double': {
        var bottomH = 25 + Math.random() * 16;  // 25–41
        var gap     = 10 + Math.random() * 5;   // 10–15
        var topH    = 25 + Math.random() * 16;  // 25–41
        var dw      = 15 + Math.random() * 16;  // 15–31 (same range as block width)

        obstacles.push({
          x: canvasWidth,
          y: groundY - bottomH,
          width: dw,
          height: bottomH + gap + topH,
          color: COLOR,
          type: 'double',
          rects: [
            { x: canvasWidth, y: groundY - bottomH, w: dw, h: bottomH },
            { x: canvasWidth, y: groundY - bottomH - gap - topH, w: dw, h: topH }
          ]
        });
        break;
      }

      default: // 'block' or unknown → fallback
        w = MIN_WIDTH  + Math.random() * (MAX_WIDTH  - MIN_WIDTH);
        h = MIN_HEIGHT + Math.random() * (MAX_HEIGHT - MIN_HEIGHT);
        obstacles.push({
          x: canvasWidth,
          y: groundY - h,
          width: w,
          height: h,
          color: COLOR,
          type: 'block'
        });
        break;
    }
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
   * @param {number} dt      Delta time in seconds (capped at 0.05)
   * @param {number} speed   Game speed (px/s) — passed from main loop
   * @param {object} [weights]  Optional spawn weights from the zone system
   */
  function update(dt, speed, weights) {
    // Ramp difficulty
    elapsed += dt;
    _updateDifficulty();

    // ---- move obstacles left ----
    for (var i = obstacles.length - 1; i >= 0; i--) {
      obstacles[i].x -= speed * dt;

      // Move double obstacle rects to match
      if (obstacles[i].type === 'double' && obstacles[i].rects) {
        for (var j = 0; j < obstacles[i].rects.length; j++) {
          obstacles[i].rects[j].x -= speed * dt;
        }
      }

      // Cleanup: obstacle fully off the left edge
      if (obstacles[i].x + obstacles[i].width < 0) {
        obstacles.splice(i, 1);
      }
    }

    // ---- spawn new obstacles ----
    spawnTimer -= dt;
    if (spawnTimer <= 0) {
      _spawnObstacle(weights);
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
   * For double obstacles, tests both rects independently.
   *
   * @param {{x:number, y:number, w:number, h:number}} playerBounds
   * @returns {boolean}  true if a collision was detected
   */
  function checkCollision(playerBounds) {
    if (!playerBounds) return false;

    for (var i = 0; i < obstacles.length; i++) {
      var o = obstacles[i];

      // Double obstacles: test each rect
      if (o.type === 'double' && o.rects) {
        for (var j = 0; j < o.rects.length; j++) {
          var r = o.rects[j];
          if (aabb(playerBounds, { x: r.x, y: r.y, w: r.w, h: r.h })) {
            return true;
          }
        }
      } else {
        if (aabb(playerBounds, {
          x: o.x, y: o.y,
          w: o.width, h: o.height
        })) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Return the array of active obstacles (for external iteration, e.g. near-miss).
   *
   * @returns {object[]}  Array of obstacle objects
   */
  function getAll() {
    return obstacles;
  }

  /* ---- public exports ---- */
  return {
    init: init,
    reset: reset,
    resize: resize,
    update: update,
    draw: draw,
    checkCollision: checkCollision,
    getAll: getAll
  };
})();
