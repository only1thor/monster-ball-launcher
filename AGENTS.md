# Monster Ball Launcher — Project Context

## What it is

A mobile-portrait (vertical) browser game: the player is a circle at the bottom of
the screen defending a gate against triangles that descend from the top. Movement
is a virtual joystick (bottom-left), attacks are two buttons (bottom-right, stacked).
An attack swings an arc facing the movement direction that destroys every target it
touches.

## Spec rules (do not regress)

- **Layout:** bottom third = controls (joystick left, two stacked attack buttons
  right); top two-thirds = game canvas. Portrait only.
- **Player:** circle, 6 HP (gauge of 6 segments drawn below the character).
- **Gate:** double line at the very bottom, 12 HP (12 segments drawn between the
  two lines). Player attacks cannot damage it; it deals no damage.
- **Targets:** downward-pointing triangles, 1 HP. Spawn 3 at a time every 2 s for
  60 s (30 waves, 90 total) at random x along the top. Descend at constant speed,
  stop in contact with the gate. Cannot damage each other.
- **Attack arc:** radius = 2× player radius, span = 1/3 of circumference (120°),
  faces the direction of movement (last movement direction when stationary).
  Every target touching the arc takes the player's damage (1) and is destroyed.
- **Contact damage:** a target deals 1 damage once per second to whichever of the
  player/gate it overlaps, starting at first contact.
- **Win:** gate still has HP when all 90 targets are destroyed (spawn phase over).
  **Lose:** player HP ≤ 0, or gate HP ≤ 0 while targets remain.

## Tech decisions

- **Platform:** plain HTML/JS/Canvas — no frameworks, no build step.
- **Testing:** headless game core (`js/core.js`, zero DOM) tested with
  `node --test test/`; `test/autoplay.js` is a headless balance probe
  (greedy kiting bot must win 8/8 with the default tuning).
- **Deployment:** push to `main` → GitHub Actions deploys to GitHub Pages
  (repo `only1thor/monster-ball-launcher`).
- **Art:** all shapes drawn on canvas; no image assets.
- **Language:** English (code, comments, commits).
- **Tuning knobs:** all balance constants live in `TUNING` in `js/core.js`
  (spec-derived values labelled "(spec)"). Current: playerMaxSpeed 340,
  targetSpeedFrac 0.065, attackCooldown 0.3, attackDuration 0.22.

## How to run

```bash
python3 -m http.server 8000   # then open http://localhost:8000 on a phone-sized viewport
node --test test/             # unit tests for all game rules
node test/autoplay.js         # balance probe (expect 8/8 WIN)
```

## Target device

Mobile portrait smartphones (tested layout: ~390×844). Desktop works via
keyboard fallback (arrows/WASD move, Space/J/K attack) but the controls bar is
designed for touch.

## Known/expected

- Visual layout & control feel unverified on device — needs a look on a real phone.