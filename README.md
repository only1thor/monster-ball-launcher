# Monster Ball Launcher 🎮

A mobile-portrait browser game. You are a circle defending a gate at the bottom of
the screen: triangles rain down from the top for 60 seconds and you must destroy
all 90 of them before they chew through the gate (12 HP) or through you (6 HP).

## Controls

- **Joystick** (bottom-left) — move the player. Your attack arc faces the way you move.
- **Either attack button** (bottom-right, stacked) — swing your arc: a 120° wedge
  with radius twice the player's radius. Every target touching it is destroyed.
- Desktop fallback: **arrows/WASD** move, **Space/J/K** attack.

## Rules

- Targets: 3 spawn every 2 s for 60 s, at random x along the top. They stop in
  contact with the gate and deal 1 damage/second to whatever they touch.
- Player: 6 HP (gauge under the character). Gate: 12 HP (segments between the
  double lines).
- Win: gate still standing when all targets are destroyed.
- Lose: you take 6 damage, or the gate takes 12 while targets remain.

## Development

```bash
python3 -m http.server 8000    # play at http://localhost:8000 (phone-sized viewport)
node --test test/              # unit tests for every game rule (21 tests)
node test/autoplay.js          # balance probe: greedy bot must win 8/8
```

Push to `main` to deploy (GitHub Actions → GitHub Pages).