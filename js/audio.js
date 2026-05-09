/**
 * audio.js — IIFE on window.NEON.Audio
 *
 * Responsibilities:
 *   - Lazy AudioContext: created on first play call inside try/catch
 *     (complies with browser autoplay policies)
 *   - resume() called before every play until state === 'running'
 *     (handles iOS Safari suspended context quirk)
 *   - Three oscillator-based sound effects:
 *       Dash      — square wave, 440 Hz, 100 ms blip
 *       Death     — sawtooth sweep 300→80 Hz, 350 ms descending tone
 *       Milestone — two quick ascending tones (440 Hz, 660 Hz)
 *   - Each sound: osc → gain → destination, setValueAtTime envelope,
 *     osc.stop() + osc.disconnect() + gain.disconnect() cleanup
 *
 * Design contracts:
 *   NEON.Audio = { init(), playDash(), playDeath(), playMilestone() }
 */
window.NEON = window.NEON || {};

window.NEON.Audio = (function () {
  'use strict';

  /* ---- internal state ---- */
  var ctx = null;       // AudioContext (lazy, created on first use)
  var enabled = true;   // can be toggled externally (soundToggle button)

  /**
   * Create or return the shared AudioContext.
   * The first call triggers lazy creation inside try/catch.
   *
   * @returns {AudioContext|null}
   */
  function _ensureContext() {
    if (ctx) return ctx;

    try {
      var AudioCtx = window.AudioContext || window.webkitAudioContext;
      ctx = new AudioCtx();
    } catch (e) {
      console.warn('Audio: Web Audio API is not available in this browser');
      ctx = null;
    }

    return ctx;
  }

  /**
   * Attempt to resume a suspended AudioContext.
   * Called before every play to handle iOS Safari quirk where
   * the context starts suspended.
   *
   * @param {AudioContext} audioCtx
   */
  function _resumeIfNeeded(audioCtx) {
    if (!audioCtx) return;
    if (audioCtx.state === 'running') return;

    try {
      audioCtx.resume();
    } catch (e) {
      // Silently fail — audio just won't play
    }
  }

  /**
   * Play a single oscillator tone with an amplitude envelope.
   *
   * @param {string}  type         OscillatorNode type (e.g. 'square', 'sawtooth')
   * @param {number}  freqStart    Frequency at note start (Hz)
   * @param {number}  freqEnd      Frequency at note end (Hz) — for sweeps
   * @param {number}  duration     Note duration in seconds
   * @param {number}  volume       Peak gain (0–1)
   */
  function _playTone(type, freqStart, freqEnd, duration, volume) {
    var audioCtx = _ensureContext();
    if (!audioCtx) return;
    _resumeIfNeeded(audioCtx);

    // Create nodes
    var osc  = audioCtx.createOscillator();
    var gain = audioCtx.createGain();

    // Chain: oscillator → gain → destination
    osc.connect(gain);
    gain.connect(audioCtx.destination);

    var now = audioCtx.currentTime;
    var end = now + duration;

    // Oscillator config
    osc.type = type;
    osc.frequency.setValueAtTime(freqStart, now);

    if (freqEnd !== freqStart) {
      // Frequency sweep (used for death sound)
      osc.frequency.linearRampToValueAtTime(freqEnd, end);
    }

    // Gain envelope: quick attack, exponential decay
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, end);

    // Start and schedule stop
    osc.start(now);
    osc.stop(end);

    // Cleanup: disconnect nodes after playback to prevent memory leaks
    osc.onended = function () {
      osc.disconnect();
      gain.disconnect();
    };
  }

  /* ---- public API ---- */

  /**
   * Initialise the audio system.
   * AudioContext is NOT created here — it is created lazily
   * on the first play call to comply with autoplay policies.
   */
  function init() {
    ctx = null;
    enabled = true;
  }

  /**
   * Dash sound — short square-wave blip.
   * 440 Hz, 100 ms, fast attack + decay.
   */
  function playDash() {
    if (!enabled) return;
    _playTone('square', 440, 440, 0.1, 0.2);
  }

  /**
   * Death sound — descending sawtooth sweep.
   * 300 Hz → 80 Hz over 350 ms.
   */
  function playDeath() {
    if (!enabled) return;
    _playTone('sawtooth', 300, 80, 0.35, 0.25);
  }

  /**
   * Score milestone sound — two quick ascending tones.
   * First note: 440 Hz for 80 ms
   * Second note: 660 Hz for 80 ms (offset by ~90 ms)
   */
  function playMilestone() {
    if (!enabled) return;
    var audioCtx = _ensureContext();
    if (!audioCtx) return;
    _resumeIfNeeded(audioCtx);

    var now = audioCtx.currentTime;

    // --- First tone: 440 Hz ---
    var osc1  = audioCtx.createOscillator();
    var gain1 = audioCtx.createGain();
    osc1.type = 'square';
    osc1.frequency.setValueAtTime(440, now);
    osc1.connect(gain1);
    gain1.connect(audioCtx.destination);
    gain1.gain.setValueAtTime(0.15, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
    osc1.start(now);
    osc1.stop(now + 0.08);
    osc1.onended = function () {
      osc1.disconnect();
      gain1.disconnect();
    };

    // --- Second tone: 660 Hz ---
    var osc2  = audioCtx.createOscillator();
    var gain2 = audioCtx.createGain();
    osc2.type = 'square';
    osc2.frequency.setValueAtTime(660, now + 0.09);
    osc2.connect(gain2);
    gain2.connect(audioCtx.destination);
    gain2.gain.setValueAtTime(0.15, now + 0.09);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.17);
    osc2.start(now + 0.09);
    osc2.stop(now + 0.17);
    osc2.onended = function () {
      osc2.disconnect();
      gain2.disconnect();
    };
  }

  /**
   * Toggle sound on/off.
   * Used by the soundToggle button in index.html.
   *
   * @returns {boolean}  New enabled state
   */
  function toggle() {
    enabled = !enabled;
    return enabled;
  }

  /**
   * Check whether audio is currently enabled.
   *
   * @returns {boolean}
   */
  function isEnabled() {
    return enabled;
  }

  /* ---- public exports ---- */
  return {
    init: init,
    playDash: playDash,
    playDeath: playDeath,
    playMilestone: playMilestone,
    toggle: toggle,
    isEnabled: isEnabled
  };
})();
