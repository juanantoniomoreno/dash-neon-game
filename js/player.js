/**
 * player.js — IIFE on window.NEON.Player
 *
 * Responsibilities:
 *   - Fixed horizontal position (15 % of canvas width from left), never changes
 *   - Jump mechanic: vertical launch with gravity (Chrome Dinosaur style)
 *   - 80 ms invincibility frames (i-frames) after jump
 *   - Trail buffer: last 15 positions (8 on mobile)
 *   - Exposes bounds for AABB collision with obstacles
 *
 * Design contracts:
 *   NEON.Player = { init(), reset(), resize(), update(dt), draw(),
 *                   jump(), getBounds(), isInvincible() }
 *
 * Rendering is delegated to NEON.Render.drawPlayer().
 */
window.NEON = window.NEON || {};

window.NEON.Player = (function () {
  'use strict';

  /* ---- constants ---- */
  var WIDTH          = 24;
  var HEIGHT         = 24;
  var COLOR          = '#00ffff';   // cyan — matches the neon aesthetic
  var IFRAME_MS      = 80;          // invincibility duration after jump
  var GRAVITY        = 1200;        // px/s² — downward pull
  var JUMP_VELOCITY  = -450;        // px/s — initial upward speed (negative = up)
  var TRAIL_DESKTOP  = 15;          // trail buffer size on desktop
  var TRAIL_MOBILE   = 8;           // trail buffer size on mobile

  /* ---- internal state ---- */
  var x, y;                  // current position (x is fixed, y changes with jump/gravity)
  var velocityY = 0;         // current vertical velocity (px/s)
  var grounded = true;       // true when standing on the ground platform
  var groundY;               // Y coordinate of the ground platform top
  var iframeTimer = 0;       // remaining i-frame time in ms
  var trail = [];            // ring buffer of {x, y} positions
  var trailMax;              // max trail entries for this device
  var isMobile;              // cached mobile detection

  /* ---- public API ---- */

  /**
   * Initialise the player entity.
   * Discovers the canvas to set the X position and ground level.
   * Must be called once after Render.init().
   */
  function init() {
    var canvas = document.getElementById('gameCanvas');
    if (!canvas) {
      console.error('Player.init: canvas element #gameCanvas not found');
      return;
    }

    // Mobile detection — reduces trail size for performance
    isMobile = navigator.maxTouchPoints > 0;
    trailMax = isMobile ? TRAIL_MOBILE : TRAIL_DESKTOP;

    // Fixed X: left side of screen (15 % from left edge)
    x = canvas.width * 0.15;

    // Ground platform at 85 % of canvas height
    groundY = canvas.height * 0.85;

    reset();
  }

  /**
   * Reset player state to initial values.
   * Called on game start / restart.
   */
  function reset() {
    // latest groundY is already set by init() or resize()
    y = groundY - HEIGHT;  // sit on top of the ground platform
    velocityY = 0;
    grounded = true;
    iframeTimer = 0;
    trail = [];
  }

  /**
   * Update player position to match the current canvas size.
   * Called on window resize (wired by main.js alongside Render.resize()).
   */
  function resize() {
    var canvas = document.getElementById('gameCanvas');
    if (!canvas) return;

    x = canvas.width * 0.15;
    groundY = canvas.height * 0.85;

    // Clamp Y to the new ground level so the player doesn't float or sink
    var maxY = groundY - HEIGHT;
    if (y > maxY) {
      y = maxY;
    }
  }

  /**
   * Per-frame update.
   *
   * @param {number} dt  Delta time in seconds (capped at 0.05 by main loop)
   */
  function update(dt) {
    var dtMs = dt * 1000;

    // ---- i-frames countdown ----
    if (iframeTimer > 0) {
      iframeTimer -= dtMs;
      if (iframeTimer < 0) iframeTimer = 0;
    }

    // ---- gravity: pull the player down when airborne ----
    if (!grounded) {
      velocityY += GRAVITY * dt;
    }

    // ---- update Y position ----
    y += velocityY * dt;

    // ---- ground collision: clamp to ground level ----
    var maxY = groundY - HEIGHT;
    if (y >= maxY) {
      y = maxY;
      velocityY = 0;
      grounded = true;
    }

    // ---- trail buffer ----
    trail.push({ x: x, y: y });
    // Shift oldest when buffer exceeds max (ring-buffer via shift)
    if (trail.length > trailMax) {
      trail.shift();
    }
  }

  /**
   * Draw the player entity by delegating to NEON.Render.
   * Render.drawPlayer handles the core shape, neon glow,
   * trail after-images, and i-frame flash.
   */
  function draw() {
    NEON.Render.drawPlayer({
      x: x,
      y: y,
      width: WIDTH,
      height: HEIGHT,
      color: COLOR,
      trail: trail,
      isInvincible: iframeTimer > 0
    });
  }

  /**
   * Execute a jump.
   * Applies an upward velocity burst, starts i-frames.
   * Only works when the player is grounded.
   *
   * @returns {boolean}  true if jump was executed, false if airborne
   */
  function jump() {
    if (!grounded) return false;

    velocityY    = JUMP_VELOCITY;
    grounded     = false;
    iframeTimer  = IFRAME_MS;

    return true;
  }

  /**
   * Return the player's AABB for collision detection.
   *
   * @returns {{ x: number, y: number, w: number, h: number }}
   */
  function getBounds() {
    return { x: x, y: y, w: WIDTH, h: HEIGHT };
  }

  /**
   * Check whether the player is currently invincible (i-frames active).
   *
   * @returns {boolean}
   */
  function isInvincible() {
    return iframeTimer > 0;
  }

  /* ---- public exports ---- */
  return {
    init: init,
    reset: reset,
    resize: resize,
    update: update,
    draw: draw,
    jump: jump,
    getBounds: getBounds,
    isInvincible: isInvincible
  };
})();
