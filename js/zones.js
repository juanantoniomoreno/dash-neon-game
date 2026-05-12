/**
 * zones.js — IIFE on window.NEON.Zones
 *
 * Responsibilities:
 *   - Zone progression: 4 zones with score thresholds
 *   - Crossfade alpha interpolation for zone transitions
 *   - Exposes zone colors, spawn weights, and transition state
 *
 * Design contracts:
 *   NEON.Zones = { init(), update(score, dt), getCurrentZone(), getZoneColor(),
 *                   getObstacleColor(), getSpawnWeights(), isTransitioning(),
 *                   getCrossfadeAlpha() }
 */
window.NEON = window.NEON || {};

window.NEON.Zones = (function () {
  'use strict';

  /* ---- zone definitions ---- */
  var ZONES = [
    {
      name: 'Neon City',
      minScore: 0,
      bgTint: '#0a0a1a',
      playerColor: '#00ffff',
      obstacleColor: '#ff00ff',
      spawnWeights: { block: 0.6, pillar: 0.2, double: 0.1, wide: 0.1 }
    },
    {
      name: 'Cyber Desert',
      minScore: 100,
      bgTint: '#1a0f00',
      playerColor: '#ffaa00',
      obstacleColor: '#ff5500',
      spawnWeights: { block: 0.4, pillar: 0.3, double: 0.15, wide: 0.15 }
    },
    {
      name: 'Digital Ocean',
      minScore: 200,
      bgTint: '#000a1a',
      playerColor: '#0088ff',
      obstacleColor: '#00ffff',
      spawnWeights: { block: 0.3, pillar: 0.2, double: 0.3, wide: 0.2 }
    },
    {
      name: 'Void',
      minScore: 300,
      bgTint: '#050005',
      playerColor: '#ff00ff',
      obstacleColor: '#aa00aa',
      spawnWeights: { block: 0.2, pillar: 0.3, double: 0.3, wide: 0.2 }
    }
  ];

  /* ---- internal state ---- */
  var currentIndex = 0;
  var crossfadeAlpha = 1;

  /* ---- public API ---- */

  /**
   * Initialise the zone manager.
   * Resets zone progression state to zone 0.
   */
  function init() {
    var canvas = document.getElementById('gameCanvas');
    if (!canvas) {
      console.error('Zones.init: canvas element #gameCanvas not found');
      return;
    }
    currentIndex = 0;
    crossfadeAlpha = 1;
  }

  /**
   * Per-frame update.
   * Computes zone index from score, triggers crossfade on change,
   * and increments crossfade alpha toward 1.
   *
   * @param {number} score  Current game score
   * @param {number} dt     Delta time in seconds
   */
  function update(score, dt) {
    dt = dt || 0;

    var newIndex = Math.min(Math.floor(score / 100), 3);
    if (newIndex !== currentIndex) {
      currentIndex = newIndex;
      crossfadeAlpha = 0;
    }

    // Increment crossfade toward 1
    if (crossfadeAlpha < 1) {
      crossfadeAlpha += dt;
      if (crossfadeAlpha > 1) {
        crossfadeAlpha = 1;
      }
    }
  }

  /**
   * Return the active zone configuration object.
   *
   * @returns {object}  Zone config: { name, minScore, bgTint, playerColor, obstacleColor, spawnWeights }
   */
  function getCurrentZone() {
    return ZONES[currentIndex];
  }

  /**
   * Return the active zone's player trail colour.
   *
   * @returns {string}  Hex colour (e.g. '#00ffff')
   */
  function getZoneColor() {
    return ZONES[currentIndex].playerColor;
  }

  /**
   * Return the active zone's obstacle colour.
   *
   * @returns {string}  Hex colour (e.g. '#ff00ff')
   */
  function getObstacleColor() {
    return ZONES[currentIndex].obstacleColor;
  }

  /**
   * Return the active zone's spawn weight map.
   *
   * @returns {object}  Spawn weights (e.g. { block: 0.6, pillar: 0.2, ... })
   */
  function getSpawnWeights() {
    return ZONES[currentIndex].spawnWeights;
  }

  /**
   * Check whether a zone transition crossfade is in progress.
   *
   * @returns {boolean}
   */
  function isTransitioning() {
    return crossfadeAlpha < 1;
  }

  /**
   * Return the current crossfade alpha value (0 → 1).
   *
   * @returns {number}
   */
  function getCrossfadeAlpha() {
    return crossfadeAlpha;
  }

  /* ---- public exports ---- */
  return {
    init: init,
    update: update,
    getCurrentZone: getCurrentZone,
    getZoneColor: getZoneColor,
    getObstacleColor: getObstacleColor,
    getSpawnWeights: getSpawnWeights,
    isTransitioning: isTransitioning,
    getCrossfadeAlpha: getCrossfadeAlpha
  };
})();
