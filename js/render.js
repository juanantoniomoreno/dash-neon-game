/**
 * render.js — IIFE on window.NEON.Render
 *
 * Responsibilities:
 *   - Canvas setup, resize, clear
 *   - Offscreen background grid cache (drawn once, reused via drawImage)
 *   - Neon glow helper using concentric fillRect + globalCompositeOperation='lighter'
 *   - Entity drawing: player (with trail and i-frame flash), obstacles, particles
 *   - Screen shake with exponential decay (0.85 per frame, stops below 0.5)
 *   - drawOverlay for canvas-level text overlays
 *
 * Design: all shapes use fillRect (not arc) for performance.
 *         No shadowBlur — it is not GPU-accelerated.
 */
window.NEON = window.NEON || {};

window.NEON.Render = (function () {
  'use strict';

  /* ---- internal state ---- */
  var canvas;
  var ctx;
  var bgCanvas;      // offscreen canvas for static background grid
  var bgCtx;         // offscreen context
  var shakeAmount = 0;
  var isMobile = false;

  /** Parse a hex colour string like '#ff00ff' into {r, g, b} integers. */
  function _hexToRgb(hex) {
    var r = parseInt(hex.slice(1, 3), 16);
    var g = parseInt(hex.slice(3, 5), 16);
    var b = parseInt(hex.slice(5, 7), 16);
    return { r: r, g: g, b: b };
  }

  /**
   * Draw a filled rectangle with a neon glow effect.
   * Uses concentric, larger rectangles drawn with
   * globalCompositeOperation = 'lighter' for GPU-friendly additive blending.
   *
   * @param {number} x
   * @param {number} y
   * @param {number} w           width
   * @param {number} h           height
   * @param {string} color       hex colour e.g. '#00ffff'
   * @param {number} [glowSize]  pixel size of glow spread (default 4)
   */
  function _drawNeonRect(x, y, w, h, color, glowSize) {
    glowSize = glowSize || 4;
    var rgb = _hexToRgb(color);

    // 1. Solid core
    ctx.fillStyle = color;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillRect(x, y, w, h);

    // 2. Glow layers (concentric, expanding, decreasing alpha)
    ctx.globalCompositeOperation = 'lighter';
    var layers = isMobile ? 1 : 2;   // fewer layers on mobile for perf

    for (var i = 1; i <= layers; i++) {
      var spread = glowSize * (i / layers);
      var alpha = 0.3 / i;
      ctx.fillStyle = 'rgba(' + rgb.r + ',' + rgb.g + ',' + rgb.b + ',' + alpha + ')';
      ctx.fillRect(x - spread, y - spread, w + spread * 2, h + spread * 2);
    }

    // Reset composite mode so it does not leak to other draw calls
    ctx.globalCompositeOperation = 'source-over';
  }

  /* ---- public API ---- */

  /**
   * Initialise the renderer.
   * Must be called once after the DOM is ready.
   * Discovers the canvas element, creates the 2D context,
   * detects mobile, sizes the canvas, and caches the background.
   */
  function init() {
    canvas = document.getElementById('gameCanvas');
    if (!canvas) {
      console.error('Render.init: canvas element #gameCanvas not found');
      return;
    }
    ctx = canvas.getContext('2d');

    // Mobile detection — used for reduced glow layers and particle caps
    isMobile = navigator.maxTouchPoints > 0;

    resize();
    _cacheBackground();
  }

  /**
   * Resize the canvas to fill the viewport.
   * Called on init and on window resize.
   */
  function resize() {
    var w = window.innerWidth;
    var h = window.innerHeight;

    // Set both the bitmap resolution and the CSS size
    canvas.width = w;
    canvas.height = h;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';

    // Re-cache the background at the new size
    if (bgCanvas) {
      _cacheBackground();
    }
  }

  /**
   * Clear the entire canvas to the base colour (#0a0a1a).
   * Resets all transforms so shake offsets from previous frames
   * do not accumulate.
   */
  function clear() {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);    // identity matrix
    ctx.fillStyle = '#0a0a1a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
  }

  /**
   * Draw the pre-rendered background grid from the offscreen cache.
   * This is a lightweight drawImage call — no per-frame grid stroke work.
   */
  function drawBackground() {
    ctx.drawImage(bgCanvas, 0, 0);
  }

  /**
   * Draw the player entity.
   *
   * 1. Draw the position trail (fading after-images)
   * 2. Draw the player rectangle with neon glow
   * 3. If invincible, draw a bright outer flash
   *
   * @param {object} player  Expected shape: { x, y, width, height, color, trail[], isInvincible }
   */
  function drawPlayer(player) {
    if (!player) return;

    // --- Trail ---
    if (player.trail && player.trail.length > 0) {
      var trailLen = player.trail.length;
      var rgb = _hexToRgb(player.color);
      for (var i = 0; i < trailLen; i++) {
        var pos = player.trail[i];
        var alpha = (i / trailLen) * 0.4;          // earlier positions are dimmer
        ctx.fillStyle = 'rgba(' + rgb.r + ',' + rgb.g + ',' + rgb.b + ',' + alpha + ')';
        ctx.fillRect(pos.x, pos.y, player.width, player.height);
      }
    }

    // --- Core player ---
    _drawNeonRect(player.x, player.y, player.width, player.height, player.color, 4);

    // --- Invincibility flash (jump i-frames) ---
    if (player.isInvincible) {
      ctx.globalCompositeOperation = 'lighter';
      var t = (performance.now() % 200) / 200;   // oscillation for flicker
      var flashAlpha = t < 0.5 ? 0.5 : 0.1;
      ctx.fillStyle = 'rgba(255, 255, 255, ' + flashAlpha + ')';
      ctx.fillRect(player.x - 3, player.y - 3, player.width + 6, player.height + 6);
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  /**
   * Draw the ground platform as a horizontal neon line.
   *
   * @param {number} y      Y coordinate for the ground line
   * @param {string} [color] Hex colour for the line (defaults to '#00ffff')
   */
  function drawGround(y, color) {
    color = color || '#00ffff';
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.shadowColor = color;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
    // Reset shadow so it doesn't leak to other draw calls
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.restore();
  }

  /**
   * Draw all active obstacles.
   * Branches on obstacle type for shape-aware rendering.
   *
   * @param {object[]} obstacles  Array of { x, y, width, height, color, type, [rects] }
   */
  function drawObstacles(obstacles) {
    if (!obstacles || obstacles.length === 0) return;
    for (var i = 0; i < obstacles.length; i++) {
      var o = obstacles[i];

      // Double obstacles: draw both rects (gap visible between them)
      if (o.type === 'double' && o.rects) {
        for (var j = 0; j < o.rects.length; j++) {
          var r = o.rects[j];
          _drawNeonRect(r.x, r.y, r.w, r.h, o.color, 3);
        }
      } else {
        // Block, pillar, wide, and any untyped obstacle
        _drawNeonRect(o.x, o.y, o.width, o.height, o.color, 3);
      }
    }
  }

  /**
   * Draw all active particles as small fillRect squares.
   * Uses 'lighter' composite so overlapping particles glow.
   *
   * @param {object[]} particles  Array of { x, y, size, color, life, maxLife }
   */
  function drawParticles(particles) {
    if (!particles || particles.length === 0) return;

    ctx.globalCompositeOperation = 'lighter';

    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];
      var alpha = p.life / p.maxLife;
      var rgb;

      // Support both hex and pre-parsed rgb colour objects
      if (typeof p.color === 'string') {
        rgb = _hexToRgb(p.color);
      } else {
        rgb = p.color;   // assume {r, g, b}
      }

      ctx.fillStyle = 'rgba(' + rgb.r + ',' + rgb.g + ',' + rgb.b + ',' + alpha + ')';
      ctx.fillRect(
        p.x - p.size / 2,
        p.y - p.size / 2,
        p.size,
        p.size
      );
    }

    ctx.globalCompositeOperation = 'source-over';
  }

  /**
   * Start a screen shake.
   *
   * @param {number} intensity  Starting shake magnitude (design uses 8 for death)
   */
  function setShake(intensity) {
    shakeAmount = intensity;
  }

  /**
   * Update the screen shake state. Call once per frame.
   * Applies an exponential decay (0.85) and returns the offset
   * that should be applied via ctx.translate().
   *
   * @returns {{ x: number, y: number }}  Shake offsets for this frame
   */
  function updateShake() {
    if (shakeAmount < 0.5) {
      shakeAmount = 0;
      return { x: 0, y: 0 };
    }

    var sx = (Math.random() * 2 - 1) * shakeAmount;
    var sy = (Math.random() * 2 - 1) * shakeAmount;
    shakeAmount *= 0.85;

    return { x: sx, y: sy };
  }

  /**
   * Draw a full-canvas overlay with centred text.
   * The overlay is semi-transparent black so the game is visible behind it.
   *
   * @param {string} text     Big heading text (e.g. "GAME OVER")
   * @param {string} [subtext]  Smaller secondary text
   */
  function drawOverlay(text, subtext) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);  // reset all transforms (including shake)

    // Dim background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Main text
    ctx.fillStyle = '#00ffff';
    ctx.font = 'bold 48px "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = '#00ffff';
    ctx.shadowBlur = 16;
    ctx.fillText(text, canvas.width / 2, canvas.height / 2 - 24);

    // Subtext
    if (subtext) {
      ctx.shadowColor = '#ff00ff';
      ctx.shadowBlur = 8;
      ctx.font = '18px "Courier New", monospace';
      ctx.fillStyle = '#ff00ff';
      ctx.fillText(subtext, canvas.width / 2, canvas.height / 2 + 30);
    }

    // Reset shadow (don't leak to other draws)
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.restore();
  }

  /**
   * Draw a full-canvas semi-transparent tint overlay for zone transitions.
   *
   * @param {string} color  Hex colour for the tint
   * @param {number} alpha  Crossfade alpha value (0 → 1)
   */
  function drawBgTint(color, alpha) {
    if (!color || alpha <= 0) return;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = alpha * 0.35;
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  /**
   * Draw floating score/milestone popup text.
   * Each popup rises and fades over its lifetime.
   *
   * @param {object[]} popups  Array of { x, y, text, life, maxLife }
   */
  function drawPopups(popups) {
    if (!popups || popups.length === 0) return;
    ctx.save();
    for (var i = 0; i < popups.length; i++) {
      var p = popups[i];
      if (p.life <= 0) continue;
      var alpha = p.life / p.maxLife;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 18px "Courier New", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = '#00ffff';
      ctx.shadowBlur = 8;
      ctx.fillText(p.text, p.x, p.y);
    }
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  /* ---- private: background cache ---- */

  /**
   * Render the static background grid once to an offscreen canvas.
   * This is called at init and on resize.
   *
   * Background: near-black with subtle cyan grid lines
   * (classic synthwave/Tron aesthetic).
   */
  function _cacheBackground() {
    var w = canvas.width;
    var h = canvas.height;

    bgCanvas = document.createElement('canvas');
    bgCanvas.width = w;
    bgCanvas.height = h;
    bgCtx = bgCanvas.getContext('2d');

    // Base fill
    bgCtx.fillStyle = '#0a0a1a';
    bgCtx.fillRect(0, 0, w, h);

    // Horizontal grid lines
    bgCtx.strokeStyle = '#00ffff';
    bgCtx.globalAlpha = 0.04;
    bgCtx.lineWidth = 1;
    var step = 50;

    var x, y;
    for (x = 0; x <= w; x += step) {
      bgCtx.beginPath();
      bgCtx.moveTo(x, 0);
      bgCtx.lineTo(x, h);
      bgCtx.stroke();
    }

    for (y = 0; y <= h; y += step) {
      bgCtx.beginPath();
      bgCtx.moveTo(0, y);
      bgCtx.lineTo(w, y);
      bgCtx.stroke();
    }

    // Reset alpha
    bgCtx.globalAlpha = 1;
  }

  /* ---- public exports ---- */
  return {
    init: init,
    resize: resize,
    clear: clear,
    drawBackground: drawBackground,
    drawBgTint: drawBgTint,
    drawGround: drawGround,
    drawPlayer: drawPlayer,
    drawObstacles: drawObstacles,
    drawParticles: drawParticles,
    drawPopups: drawPopups,
    setShake: setShake,
    updateShake: updateShake,
    drawOverlay: drawOverlay
  };
})();
