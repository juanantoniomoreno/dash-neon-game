/**
 * player.js — IIFE on window.NEON.Player
 *
 * Responsibilities:
 *   - Fixed vertical lane (Y position set at init, does not change)
 *   - Dash mechanic: forward burst then drift back to base X
 *   - 80 ms invincibility frames (i-frames) after dash
 *   - Dash cooldown (250 ms) to prevent spamming
 *   - Trail buffer: last 15 positions (8 on mobile)
 *   - Exposes bounds for AABB collision with obstacles
 *
 * Design contracts:
 *   NEON.Player = { init(), update(dt), draw(), dash(),
 *                   getBounds(), isInvincible() }
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
  var IFRAME_MS      = 80;          // invincibility duration after dash
  var COOLDOWN_MS    = 250;         // minimum time between dashes
  var DASH_DISTANCE  = 120;         // px burst forward (right)
  var DRIFT_SPEED    = 200;         // px/s — how fast the player drifts back
  var TRAIL_DESKTOP  = 15;          // trail buffer size on desktop
  var TRAIL_MOBILE   = 8;           // trail buffer size on mobile

  /* ---- internal state ---- */
  var x, y;                  // current position
  var baseX;                 // rest position (drift target)
  var dashOffset = 0;       // current forward offset from dash burst
  var iframeTimer = 0;      // remaining i-frame time in ms
  var cooldownTimer = 0;    // remaining cooldown time in ms
  var trail = [];            // ring buffer of {x, y} positions
  var trailMax;              // max trail entries for this device
  var isMobile;              // cached mobile detection

  /* ---- public API ---- */

  /**
   * Initialise the player entity.
   * Discovers the canvas to set the Y lane and base X.
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

    // Fixed lane: vertically centred
    y = (canvas.height - HEIGHT) / 2;

    // Base X: left side of screen (15 % from left edge)
    baseX = canvas.width * 0.15;

    reset();
  }

  /**
   * Reset player state to initial values.
   * Called on game start / restart.
   */
  function reset() {
    x = baseX;
    dashOffset = 0;
    iframeTimer = 0;
    cooldownTimer = 0;
    trail = [];
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

    // ---- cooldown countdown ----
    if (cooldownTimer > 0) {
      cooldownTimer -= dtMs;
      if (cooldownTimer < 0) cooldownTimer = 0;
    }

    // ---- dash drift: decay offset back toward 0 ----
    if (dashOffset > 0) {
      dashOffset -= DRIFT_SPEED * dt;
      if (dashOffset < 0) dashOffset = 0;
    }

    // Final X = base position + dash burst offset
    x = baseX + dashOffset;

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
   * Execute a dash.
   * Applies a forward burst (right), starts i-frames,
   * and puts dash on cooldown to prevent spamming.
   *
   * @returns {boolean}  true if dash was executed, false if on cooldown
   */
  function dash() {
    if (cooldownTimer > 0) return false;

    dashOffset    = DASH_DISTANCE;
    iframeTimer   = IFRAME_MS;
    cooldownTimer = COOLDOWN_MS;

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
    update: update,
    draw: draw,
    dash: dash,
    getBounds: getBounds,
    isInvincible: isInvincible
  };
})();
