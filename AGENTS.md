# Monster Ball Launcher — Project Context

## What it is

A browser-based space-invader game with monster capture mechanics. Player moves side-to-side, shoots capture balls (Space), and fires attacks (Shift) to weaken/defeat an on-coming horde of monsters.

## Tech decisions

- **Platform:** Browser-based HTML/JS/Canvas — no frameworks, no build step
- **Deployment:** GitHub Pages via GitHub Actions (`only1thor/monster-ball-launcher`)
- **Art style:** Simple shapes, units exported as `.png` sprites
- **Language:** English (code, comments, commits)

## V1 scope

Core mechanics only:
- Player movement (arrow keys, left/right)
- Capture ball shooting (Space)
- Fire attacks (Shift)
- Monster horde descending from top
- Capture vs defeat logic
- Basic score / feedback

## Target device

Not yet specified — ask before building UI.

## How to run

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

## How to deploy

Push to `main` — GitHub Actions deploys to GitHub Pages (configure once Actions workflow is set up).

## Art assets

`.png` sprites live in `assets/` directory. Generated as simple shapes (no external art tools).