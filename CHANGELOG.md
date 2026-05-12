# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0] - 2026-05-12

### Changed
- Complete mechanic rewrite: replaced horizontal dash with vertical jump (Chrome dinosaur style).
- Player now runs on a horizontal ground platform and jumps over obstacles.
- Obstacles changed from vertical walls with gaps to horizontal blocks sitting on the ground.
- Score system changed from combo-based to pure time-based.

### Technical
- `player.js`: added gravity (`1200 px/s²`) and jump velocity (`-450 px/s`), removed dash drift.
- `obstacles.js`: simplified collision to single-rect AABB, removed gap-generation logic.
- `render.js`: added `drawGround()` for the neon platform line.
- `main.js`: updated game loop for jump input, removed combo multiplier.
- `index.html`: updated instructions text from "dash" to "jump".
- Added `.gitignore` for editor/OS artifacts and SDD tooling.
- Added `AGENTS.md` with project-specific agent context.
- Added `README.md` with game documentation.
- Added `CHANGELOG.md`.

## [0.1.0] - 2026-05-09

### Added
- Initial release with dash mechanic.
- Player dashes horizontally to the right.
- Vertical neon walls with gaps move left.
- Combo multiplier system (increments per dash).
- Score tracking with best score persistence.
- Neon glow rendering with additive blending.
- Particle effects, screen shake, milestone sounds.
- Mobile support with touch input.
