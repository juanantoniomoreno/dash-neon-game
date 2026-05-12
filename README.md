# Neon Dash

A neon-styled endless runner game built with vanilla HTML5 Canvas and JavaScript. Inspired by the Chrome dinosaur game — run, jump, and survive as long as you can.

![Game Screenshot](screenshot.png)

## Play

Open `index.html` in any modern web browser. No build step required.

```bash
# Optional: serve locally with Python
python3 -m http.server 8080
```

Then visit `http://localhost:8080`.

## Controls

| Input | Action |
|---|---|
| `Space` | Jump |
| `Enter` | Jump |
| `ArrowUp` | Jump |
| `Tap` (mobile) | Jump |

## Features

- Vertical jump physics with gravity
- Procedurally spawned obstacles of varying sizes
- Difficulty ramp: speed and spawn rate increase over time
- Neon glow rendering (additive blending, no shadowBlur)
- Screen shake on death
- Particle effects on jump, death, and score milestones
- Score tracking with best score persistence via localStorage
- Mobile support (touch + reduced particle/glow for performance)
- Sound effects via Web Audio API oscillator

## Project Structure

```
.
├── index.html          # Entry point, DOM overlays, script loading order
├── css/
│   └── style.css       # Full-bleed neon aesthetic, overlays, animations
├── js/
│   ├── render.js       # Canvas setup, neon glow, background cache, shake
│   ├── input.js        # Keyboard/touch normalization, cooldown, death lock
│   ├── audio.js        # Lazy AudioContext, oscillator-based SFX
│   ├── particles.js    # Particle emitter, life management
│   ├── player.js       # Jump physics, gravity, i-frames, trail
│   ├── obstacles.js    # Obstacle spawner, AABB collision
│   └── main.js         # Game loop, state machine, scoring, module wiring
└── .gitignore
```

## Tech Stack

- **Runtime:** Browser (HTML5 Canvas 2D)
- **Language:** Vanilla JavaScript (ES5-style IIFE modules)
- **Styling:** CSS3
- **Build Tool:** None (static files)
- **Module System:** Global namespace (`window.NEON.*`)

## Architecture

The game uses a modular IIFE pattern with manual script ordering in `index.html`:

1. `render.js` — Canvas and drawing primitives
2. `input.js` — Input normalization
3. `audio.js` — Sound effects
4. `particles.js` — Particle system
5. `player.js` — Player entity
6. `obstacles.js` — Obstacle manager
7. `main.js` — Game loop and state machine

Each module exposes a public API via `window.NEON.ModuleName` and communicates through explicit method calls (no event bus or pub/sub).

## License

MIT
