/**
 * main.js — IIFE on window.NEON.Game
 *
 * Responsibilities:
 *   - 3-state FSM: 'menu' → 'playing' → 'dead' → 'playing'
 *   - requestAnimationFrame game loop with dt capped at 50ms
 *   - Time-based score tracking
 *   - Best score persistence via localStorage key 'neonDash_bestScore'
 *   - Mobile detection via navigator.maxTouchPoints
 *   - Module wiring: calls init/update/draw on all other NEON modules
 *   - UI updates: score display, best score, overlay toggles
 *   - Sound toggle button wiring
 *   - Difficulty ramp: obstacle speed increases over elapsed time
 *   - Milestone sounds + particles every 50 points
 *   - Screen shake on death (delegated to Render)
 *   - Jump particles on jump, death particles, milestone particles
 *
 * Design contract:
 *   NEON.Game = { init() }
 *   init() auto-starts the rAF loop and wires all modules.
 */
window.NEON = window.NEON || {};

window.NEON.Game = (function () {
  'use strict';

  /* ---- constants ---- */
  var BASE_SPEED   = 300;     // initial obstacle speed (px/s)
  var SPEED_RAMP   = 15;      // speed increase per elapsed second (px/s²)
  var SCORE_RATE   = 10;      // base score points per second
  var DT_CAP       = 0.05;    // max dt in seconds (prevents tunneling after tab switch)

  /* ---- internal state ---- */
  var state          = 'menu';   // 'menu' | 'playing' | 'dead'
  var score          = 0;
  var bestScore      = 0;
  var elapsed        = 0;        // seconds spent in current play session
  var speed          = BASE_SPEED;
  var lastMilestone  = 0;        // floor(score / 50) of last triggered milestone
  var multiplier     = 1;        // score multiplier (x2 on near-miss)
  var multiplierTimer = 0;       // remaining time for current multiplier (seconds)
  var nearMissCooldown = 0;      // prevents near-miss spam (seconds)
  var popups         = [];       // floating score/milestone popups {x, y, text, life, maxLife}
  var shownZonePopup = false;    // prevents zone name popup from showing every frame
  var lastTime       = 0;        // last rAF timestamp (0 = first frame)
  var requestId      = null;     // rAF handle
  var isMobile        = false;

  /* ---- cached DOM elements ---- */
  var scoreDisplay;
  var bestScoreDisplay;
  var instructionsOverlay;
  var gameOverOverlay;
  var finalScoreEl;
  var finalBestEl;
  var soundToggleBtn;

  /* =============================================================== */
  /*  STATE TRANSITIONS                                              */
  /* =============================================================== */

  /**
   * Transition to 'playing' state.
   * Hides overlays, resets all game modules and tracking variables,
   * shows the score displays.
   */
  function _goToPlaying() {
    state = 'playing';

    // UI visibility
    instructionsOverlay.classList.add('hidden');
    gameOverOverlay.classList.add('hidden');
    scoreDisplay.style.display = '';
    bestScoreDisplay.style.display = '';

    // Reset game modules
    NEON.Player.reset();
    NEON.Obstacles.reset();
    NEON.Particles.init();   // clears all active particles
    NEON.Zones.init();       // revert to zone 0 with no crossfade
    NEON.Player.setColor('#00ffff');  // reset to default cyan

    // Reset tracking
    score = 0;
    elapsed = 0;
    speed = BASE_SPEED;
    lastMilestone = 0;
    multiplier = 1;
    multiplierTimer = 0;
    nearMissCooldown = 0;
    popups = [];
    shownZonePopup = false;
    lastTime = 0;            // force dt = 0 on next frame

    // Register landing dust callback
    NEON.Player.onLand(function (px, py) {
      NEON.Particles.emit(px, py, 4 + Math.floor(Math.random() * 4), NEON.Zones.getZoneColor());
    });

    _updateScoreDisplay();
  }

  /**
   * Handle player death.
   * Locks input, triggers death effects (shake, particles, sound),
   * persists best score, shows game-over overlay.
   */
  function _handleDeath() {
    state = 'dead';

    // Lock input to prevent accidental instant restart
    NEON.Input.lock(500);

    // ---- death effects ----

    // Screen shake
    NEON.Render.setShake(8);

    // Particle burst at player position (magenta, large)
    var b = NEON.Player.getBounds();
    var px = b.x + b.w / 2;
    var py = b.y + b.h / 2;
    NEON.Particles.emit(px, py, 15 + Math.floor(Math.random() * 11), '#ff00ff');

    // Death sound
    NEON.Audio.playDeath();

    // ---- persist best score ----
    var finalScore = Math.floor(score);
    if (finalScore > bestScore) {
      bestScore = finalScore;
      try {
        localStorage.setItem('neonDash_bestScore', bestScore);
      } catch (e) {
        // Private browsing / quota exceeded — best score only lives in memory
      }
    }

    // ---- game-over overlay ----
    finalScoreEl.textContent = 'Score: ' + finalScore;
    finalBestEl.textContent = 'Best: ' + bestScore;
    gameOverOverlay.classList.remove('hidden');
  }

  /**
   * Restart from 'dead' state (called after lock expires + input).
   */
  function _restartGame() {
    _goToPlaying();
  }

  /* =============================================================== */
  /*  GAME LOOP                                                      */
  /* =============================================================== */

  /**
   * rAF callback. Calculates delta time capped at 50ms,
   * dispatches to update/draw, then schedules the next frame.
   *
   * @param {number} timestamp  DOMHighResTimeStamp
   */
  function _gameLoop(timestamp) {
    // First frame — initialise lastTime and skip this tick
    if (lastTime === 0) {
      lastTime = timestamp;
      requestId = requestAnimationFrame(_gameLoop);
      return;
    }

    // Capped delta time prevents physics tunneling after tab switch
    var dt = Math.min((timestamp - lastTime) / 1000, DT_CAP);
    lastTime = timestamp;

    _update(dt);
    _draw();
    NEON.Input.update();   // clear input flags at end of frame

    requestId = requestAnimationFrame(_gameLoop);
  }

  /* =============================================================== */
  /*  UPDATE                                                         */
  /* =============================================================== */

  /**
   * Per-frame update. Dispatches to state-specific handlers.
   *
   * @param {number} dt  Delta time in seconds
   */
  function _update(dt) {
    switch (state) {

      /* ---- menu: wait for any input to start ---- */
      case 'menu':
        if (NEON.Input.isPressed()) {
          _goToPlaying();
        }
        break;

      /* ---- playing: core gameplay update ---- */
      case 'playing':
        _updatePlaying(dt);
        break;

      /* ---- dead: wait for input after lock expires ---- */
      case 'dead':
        // Keyboard restart (Input.isPressed respects the death lock)
        if (NEON.Input.isPressed() && !NEON.Input.isLocked()) {
          _restartGame();
        }
        break;
    }
  }

  /**
   * Playing-state update: difficulty ramp, player, obstacles,
   * particles, score, collision.
   */
  function _updatePlaying(dt) {
    // ---- zone progression ----
    NEON.Zones.update(score, dt);
    var currentZone = NEON.Zones.getCurrentZone();
    var transitioning = NEON.Zones.isTransitioning();

    // Zone transition popup and colour swap (once per transition)
    if (transitioning) {
        if (!shownZonePopup) {
            var canvas = document.getElementById('gameCanvas');
            addPopup(currentZone.name.toUpperCase(), canvas.width / 2, canvas.height / 3);
            NEON.Player.setColor(NEON.Zones.getZoneColor());
            NEON.Obstacles.setColor(NEON.Zones.getObstacleColor());
            shownZonePopup = true;
        }
    } else {
        shownZonePopup = false;
    }

    // ---- difficulty ramp: speed increases with time ----
    elapsed += dt;
    speed = BASE_SPEED + elapsed * SPEED_RAMP;

    // ---- player physics (gravity + jump arc) ----
    NEON.Player.update(dt);

    // ---- jump input ----
    if (NEON.Input.isPressed()) {
      if (NEON.Player.jump()) {
        // Jump executed — sound + particles

        // Jump sound
        NEON.Audio.playDash();

        // Jump particles (small cyan burst at player feet — ground level)
        var jb = NEON.Player.getBounds();
        NEON.Particles.emit(
          jb.x + jb.w / 2,
          jb.y + jb.h,                    // feet / ground contact point
          5 + Math.floor(Math.random() * 4),   // 5–8 particles
          '#00ffff'
        );
      }
    }

    // ---- obstacles ----
    NEON.Obstacles.update(dt, speed, NEON.Zones.getSpawnWeights());

    // ---- particles ----
    NEON.Particles.update(dt);

    // ---- multiplier & cooldown timers ----
    if (multiplierTimer > 0) {
      multiplierTimer -= dt;
      if (multiplierTimer <= 0) {
        multiplierTimer = 0;
        multiplier = 1;
      }
    }
    if (nearMissCooldown > 0) {
      nearMissCooldown -= dt;
      if (nearMissCooldown < 0) nearMissCooldown = 0;
    }

    // ---- score (time-based, with multiplier) ----
    score += dt * SCORE_RATE * multiplier;

    // ---- milestone check (every 50 points) ----
    var currentMilestone = Math.floor(score / 50);
    if (currentMilestone > lastMilestone) {
      lastMilestone = currentMilestone;

      // Milestone sound
      NEON.Audio.playMilestone();

      // Milestone particles (medium cyan burst)
      var mb = NEON.Player.getBounds();
      NEON.Particles.emit(
        mb.x + mb.w / 2,
        mb.y + mb.h / 2,
        8 + Math.floor(Math.random() * 5),   // 8–12 particles
        '#00ffff'
      );

      // Milestone score popup
      addPopup(Math.floor(score) + '!', mb.x + mb.w / 2, mb.y - 20);
    }

    // ---- popup lifecycle ----
    for (var pi = popups.length - 1; pi >= 0; pi--) {
      popups[pi].life -= dt;
      popups[pi].y -= 60 * dt;   // rise upward
      if (popups[pi].life <= 0) {
        popups.splice(pi, 1);
      }
    }

    // Always keep the score display current
    _updateScoreDisplay();

    // ---- collision detection (skip if invincible) ----
    var playerBounds = NEON.Player.getBounds();
    if (!NEON.Player.isInvincible()) {
      if (NEON.Obstacles.checkCollision(playerBounds)) {
        _handleDeath();
      }
    }

    // ---- near-miss detection ----
    var obsList = NEON.Obstacles.getAll();
    for (var oi = 0; oi < obsList.length; oi++) {
      var obs = obsList[oi];
      // Obstacle just passed the player?
      if (obs.x + obs.width < playerBounds.x && !obs.nearMissChecked) {
        obs.nearMissChecked = true;

        // Compute obstacle top Y
        var obsTop = obs.y;
        if (obs.type === 'double' && obs.rects && obs.rects.length >= 2) {
          // Double obstacle: top is the upper rect's top (smaller Y)
          obsTop = obs.rects[0].y < obs.rects[1].y ? obs.rects[0].y : obs.rects[1].y;
        }

        // Vertical gap: distance between player's feet and obstacle's top
        var playerFeetY = playerBounds.y + playerBounds.h;
        var gap = Math.abs(playerFeetY - obsTop);

        if (gap <= 8 && nearMissCooldown <= 0) {
          multiplier = 2;
          multiplierTimer = 3.0;
          nearMissCooldown = 0.5;
          addPopup('x2', playerBounds.x + playerBounds.w / 2, playerBounds.y - 10);
        }
      }
    }
  }

  /* =============================================================== */
  /*  DRAW                                                           */
  /* =============================================================== */

  /**
   * Per-frame draw. Clears canvas, draws background, then dispatches
   * to state-specific draw routines. Applies screen shake via
   * ctx.translate() (accessing the same canvas context Render uses).
   */
  function _draw() {
    NEON.Render.clear();
    NEON.Render.drawBackground();

    switch (state) {

      case 'menu':
        // Static background; instructions overlay handles the UI via DOM
        break;

      case 'playing':
        // Apply screen shake offset (if any)
        var shake = NEON.Render.updateShake();
        var canvas = document.getElementById('gameCanvas');
        if (shake.x !== 0 || shake.y !== 0) {
          var ctx = canvas.getContext('2d');
          ctx.save();
          ctx.translate(shake.x, shake.y);
          _drawEntities();
          ctx.restore();
        } else {
          _drawEntities();
        }
        break;

      case 'dead':
        // Continue drawing entities behind the overlay; shake may still decay
        var deadShake = NEON.Render.updateShake();
        var cvs = document.getElementById('gameCanvas');
        var dCtx = cvs.getContext('2d');
        dCtx.save();
        if (deadShake.x !== 0 || deadShake.y !== 0) {
          dCtx.translate(deadShake.x, deadShake.y);
        }
        _drawEntities();
        dCtx.restore();

        // Game-over overlay is shown/hidden via DOM in _handleDeath / _goToPlaying
        break;
    }
  }

  /**
   * Draw all game entities in order.
   */
  function _drawEntities() {
    // Ground platform (85 % of canvas height, consistent with Player/Obstacles)
    var canvas = document.getElementById('gameCanvas');
    var groundY = canvas.height * 0.85;

    // Zone background tint overlay (after static background, before entities)
    var zone = NEON.Zones.getCurrentZone();
    NEON.Render.drawBgTint(zone.bgTint, NEON.Zones.getCrossfadeAlpha());

    NEON.Render.drawGround(groundY, '#00ffff');

    NEON.Player.draw();
    NEON.Obstacles.draw();
    NEON.Particles.draw();
    NEON.Render.drawPopups(popups);
  }

  /* =============================================================== */
  /*  UI HELPERS                                                     */
  /* =============================================================== */

  /**
   * Add a floating popup that rises and fades.
   *
   * @param {string} text  Popup text (e.g. 'x2', '50!')
   * @param {number} x     X position on canvas
   * @param {number} y     Y position on canvas
   */
  function addPopup(text, x, y) {
    popups.push({ x: x, y: y, text: text, life: 1.5, maxLife: 1.5 });
  }

  /**
   * Update score and best-score DOM elements.
   */
  function _updateScoreDisplay() {
    scoreDisplay.textContent = Math.floor(score);
    bestScoreDisplay.textContent = 'BEST ' + bestScore;
  }

  /**
   * Handle click/touch interaction on overlays.
   * In menu: starts the game. In dead: restarts if lock has expired.
   *
   * @param {Event} e  DOM event (unused, kept for API consistency)
   */
  function _onOverlayInteraction(e) {
    if (state === 'menu') {
      _goToPlaying();
    } else if (state === 'dead') {
      // Respect the input lock so the player can't accidentally restart
      // by tapping the overlay right after dying.
      if (!NEON.Input.isLocked()) {
        _restartGame();
      }
    }
  }

  /* =============================================================== */
  /*  PUBLIC API                                                     */
  /* =============================================================== */

  /**
   * Initialise the entire game.
   * Must be called once after all modules have loaded and the DOM is ready.
   *
   *  1. Loads best score from localStorage (try/catch)
   *  2. Detects mobile
   *  3. Caches all DOM element references
   *  4. Initialises all NEON modules in dependency order
   *  5. Wires overlay interaction handlers
   *  6. Wires the sound toggle button
   *  7. Wires window resize
   *  8. Sets initial UI state
   *  9. Starts the requestAnimationFrame loop
   */
  function init() {
    // ---- mobile detection ----
    isMobile = navigator.maxTouchPoints > 0;

    // ---- load best score from localStorage ----
    try {
      var stored = localStorage.getItem('neonDash_bestScore');
      if (stored !== null) {
        bestScore = parseInt(stored, 10) || 0;
      }
    } catch (e) {
      // Private browsing or storage API unavailable — start at 0
      bestScore = 0;
    }

    // ---- cache DOM element references ----
    scoreDisplay        = document.getElementById('scoreDisplay');
    bestScoreDisplay    = document.getElementById('bestScoreDisplay');
    instructionsOverlay = document.getElementById('instructionsOverlay');
    gameOverOverlay     = document.getElementById('gameOverOverlay');
    finalScoreEl        = document.getElementById('finalScore');
    finalBestEl         = document.getElementById('finalBest');
    soundToggleBtn      = document.getElementById('soundToggle');

    // ---- initialise all modules (strict dependency order) ----
    NEON.Render.init();
    NEON.Zones.init();
    NEON.Input.init();
    NEON.Audio.init();
    NEON.Particles.init();
    NEON.Player.init();
    NEON.Obstacles.init();

    // ---- wire overlay interactions ----
    // These handle click + touch on the instructions and game-over overlays.
    // When overlays are hidden (display:none), these handlers won't fire.
    if (instructionsOverlay) {
      instructionsOverlay.addEventListener('click', _onOverlayInteraction);
      instructionsOverlay.addEventListener('touchstart', function (e) {
        e.preventDefault();   // suppress scroll/zoom on touch
        _onOverlayInteraction();
      });
    }

    if (gameOverOverlay) {
      gameOverOverlay.addEventListener('click', _onOverlayInteraction);
      gameOverOverlay.addEventListener('touchstart', function (e) {
        e.preventDefault();
        _onOverlayInteraction();
      });
    }

    // ---- wire sound toggle button ----
    if (soundToggleBtn) {
      soundToggleBtn.addEventListener('click', function (e) {
        e.stopPropagation();  // prevent the click from reaching overlays
        var enabled = NEON.Audio.toggle();
        // Update button icon: 🔊 when on, 🔇 when off
        soundToggleBtn.innerHTML = enabled ? '&#x1F50A;' : '&#x1F507;';
      });
    }

    // ---- wire window resize ----
    window.addEventListener('resize', function () {
      NEON.Render.resize();
      NEON.Player.resize();
      NEON.Obstacles.resize();
    });

    // ---- initial UI state ----
    // Menu: instructions overlay visible, game-over overlay hidden, score hidden
    instructionsOverlay.classList.remove('hidden');
    gameOverOverlay.classList.add('hidden');
    scoreDisplay.style.display = 'none';
    bestScoreDisplay.style.display = 'none';
    bestScoreDisplay.textContent = 'BEST ' + bestScore;

    // ---- start the game loop ----
    lastTime = 0;
    requestId = requestAnimationFrame(_gameLoop);
  }

  /* ---- public exports ---- */
  return {
    init: init
  };
})();

// Auto-start when the DOM is ready.
// Since <script> tags live at the end of <body>, the DOM is already
// parsed by the time this IIFE evaluates. The guard handles edge cases
// where the script might be loaded asynchronously.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', function () {
    NEON.Game.init();
  });
} else {
  NEON.Game.init();
}
