/**
 * particles.js — IIFE on window.NEON.Particles
 *
 * Responsibilities:
 *   - fillRect-based particle system (no arc/circle for performance)
 *   - Cap: 100 particles on desktop, 50 on mobile
 *   - Emit bursts on dash, death, and score milestones
 *   - Particles have velocity, gravity, life, and alpha fade
 *   - Oldest-first removal when the cap is exceeded
 *   - Drawing delegated to NEON.Render.drawParticles()
 *
 * Design contracts:
 *   NEON.Particles = { init(), emit(x, y, count, color),
 *                      update(dt), draw(ctx) }
 */
window.NEON = window.NEON || {};

window.NEON.Particles = (function () {
  'use strict';

  /* ---- constants ---- */
  var GRAVITY      = 150;        // px/s² — downward pull
  var CAP_DESKTOP  = 100;        // maximum particles on desktop
  var CAP_MOBILE   = 50;         // maximum particles on mobile
  var MIN_SPEED    = 60;         // minimum initial speed (px/s)
  var MAX_SPEED    = 280;        // maximum initial speed (px/s)
  var MIN_SIZE     = 2;          // minimum particle size (px)
  var MAX_SIZE     = 6;          // maximum particle size (px)
  var MIN_LIFE     = 0.3;        // minimum lifetime (seconds)
  var MAX_LIFE     = 1.2;        // maximum lifetime (seconds)

  /* ---- internal state ---- */
  var particles = [];
  var maxParticles;
  var isMobile;

  /* ---- public API ---- */

  /**
   * Initialise the particle system.
   * Must be called once, typically from main.js during boot.
   */
  function init() {
    isMobile = navigator.maxTouchPoints > 0;
    maxParticles = isMobile ? CAP_MOBILE : CAP_DESKTOP;
    particles = [];
  }

  /**
   * Emit a burst of particles at the given position.
   * Particles are created with random velocity, size, and life.
   * If the cap is exceeded, the oldest particles are removed first.
   *
   * @param {number} x       Emit centre X
   * @param {number} y       Emit centre Y
   * @param {number} count   Number of particles to create
   * @param {string} color   Hex colour string (e.g. '#00ffff')
   */
  function emit(x, y, count, color) {
    for (var i = 0; i < count; i++) {
      // Random direction (full 360 degrees)
      var angle = Math.random() * Math.PI * 2;

      // Random speed within range
      var speed = MIN_SPEED + Math.random() * (MAX_SPEED - MIN_SPEED);

      // Random size
      var size = MIN_SIZE + Math.random() * (MAX_SIZE - MIN_SIZE);

      // Random lifetime
      var life = MIN_LIFE + Math.random() * (MAX_LIFE - MIN_LIFE);

      particles.push({
        x: x,
        y: y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 50,  // slight upward bias for more visual spread
        size: size,
        color: color,
        life: life,
        maxLife: life
      });
    }

    // ---- cap enforcement: oldest-first ----
    while (particles.length > maxParticles) {
      particles.shift();
    }
  }

  /**
   * Per-frame update.
   * Moves particles by velocity, applies gravity, reduces life,
   * and removes expired particles (life <= 0).
   *
   * @param {number} dt  Delta time in seconds (capped at 0.05 by main loop)
   */
  function update(dt) {
    for (var i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];

      // Apply velocity
      p.x += p.vx * dt;
      p.y += p.vy * dt;

      // Apply gravity
      p.vy += GRAVITY * dt;

      // Reduce life
      p.life -= dt;

      // Remove expired particles
      if (p.life <= 0) {
        particles.splice(i, 1);
      }
    }
  }

  /**
   * Draw all active particles by delegating to NEON.Render.
   * The ctx parameter is accepted for interface consistency but
   * is not used — Render uses its own internal canvas context.
   *
   * @param {CanvasRenderingContext2D} ctx  (unused, kept for design contract)
   */
  function draw(ctx) {
    NEON.Render.drawParticles(particles);
  }

  /* ---- public exports ---- */
  return {
    init: init,
    emit: emit,
    update: update,
    draw: draw
  };
})();
