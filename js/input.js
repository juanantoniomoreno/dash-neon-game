/**
 * input.js — IIFE on window.NEON.Input
 *
 * Responsibilities:
 *   - Unify keyboard (Space, Enter, ArrowUp) and touch input
 *     into a single isPressed() API
 *   - Enforce a 50 ms cooldown between registered inputs
 *     (prevents double-fire on hybrid devices)
 *   - Lock input for 500 ms after death to prevent
 *     accidental instant restart
 *   - isPressed() returns true for exactly one frame;
 *     update() clears the flag at end of frame
 *   - Call preventDefault on touchstart to suppress
 *     scroll / zoom within the canvas area
 */
window.NEON = window.NEON || {};

window.NEON.Input = (function () {
  'use strict';

  /* ---- constants ---- */
  var COOLDOWN_MS = 50;
  var DEATH_LOCK_MS = 500;

  /* ---- internal state ---- */
  var _pressedThisFrame = false;   // set true when a valid input arrives this frame
  var _consumed = false;           // set true after isPressed() returns true
  var _lastPressTime = 0;          // performance.now() of last registered press
  var _lockUntil = 0;              // performance.now() timestamp until which input is ignored
  var _boundOnKey = null;          // bound keydown handler (for potential cleanup)
  var _boundOnTouch = null;        // bound touchstart handler

  /**
   * Core handler for any valid input event (keyboard or touch).
   * Respects cooldown and death lock.
   */
  function _onValidInput() {
    var now = performance.now();

    // 1. Death lock — ignore everything during lock window
    if (now < _lockUntil) {
      return;
    }

    // 2. Cooldown — discard inputs that arrive too soon after the last one
    if (now - _lastPressTime < COOLDOWN_MS) {
      return;
    }

    // 3. Register the press
    _pressedThisFrame = true;
    _consumed = false;
    _lastPressTime = now;
  }

  /* ---- public API ---- */

  /**
   * Initialise input listeners.
   * Must be called once. Discovers the canvas element internally.
   */
  function init() {
    var canvas = document.getElementById('gameCanvas');
    if (!canvas) {
      console.error('Input.init: canvas element #gameCanvas not found');
      return;
    }

    // --- Keyboard ---
    _boundOnKey = function (e) {
      // Accept Space, Enter, ArrowUp
      if (e.code === 'Space' || e.code === 'Enter' || e.code === 'ArrowUp') {
        e.preventDefault();   // suppress page scroll on Space/ArrowUp
        _onValidInput();
      }
    };
    window.addEventListener('keydown', _boundOnKey);

    // --- Touch ---
    _boundOnTouch = function (e) {
      e.preventDefault();  // suppress scroll, zoom, and long-press context menus
      _onValidInput();
    };
    canvas.addEventListener('touchstart', _boundOnTouch, { passive: false });
  }

  /**
   * Must be called exactly once per frame, at the end of the frame.
   * Clears the pressed flag so that isPressed() returns true
   * for at most one call per frame.
   */
  function update() {
    _pressedThisFrame = false;
    _consumed = false;
  }

  /**
   * Check whether an input was registered this frame.
   * Returns true ONCE per press event — subsequent calls
   * in the same frame return false.
   *
   * @returns {boolean}
   */
  function isPressed() {
    if (_pressedThisFrame && !_consumed) {
      _consumed = true;
      return true;
    }
    return false;
  }

  /**
   * Lock input for the given number of milliseconds.
   * Used on player death to prevent accidental restart.
   *
   * @param {number} ms  Duration of the lock
   */
  function lock(ms) {
    _lockUntil = performance.now() + ms;
    // Clear any pending press that arrived this frame so the lock
    // takes effect immediately.
    _pressedThisFrame = false;
    _consumed = false;
  }

  /**
   * Check whether input is currently locked (death lock active).
   *
   * @returns {boolean}
   */
  function isLocked() {
    return performance.now() < _lockUntil;
  }

  /* ---- public exports ---- */
  return {
    init: init,
    update: update,
    isPressed: isPressed,
    lock: lock,
    isLocked: isLocked
  };
})();
