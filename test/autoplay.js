'use strict';
/*
 * Headless balance probe: a greedy autoplayer plays full rounds.
 * Not part of the unit suite (it probes tuning, not rules).
 * Strategy: chase the nearest target; when close and roughly in front,
 * hold attack. Doesn't dodge; tests whether the constants are winnable.
 *
 * Usage: node test/autoplay.js [seed ...]   (default seeds: 1..8)
 * Exit code 0 only if every round was won.
 */
const { Game, TUNING } = require('../js/core.js');

const DT = 1 / 60;

function autoplay(seed) {
  const ov = {};
  if (process.env.PS) ov.playerMaxSpeed = +process.env.PS;
  if (process.env.TS) ov.targetSpeedFrac = +process.env.TS;
  if (process.env.CD) ov.attackCooldown = +process.env.CD;
  if (process.env.DUR) ov.attackDuration = +process.env.DUR;
  const g = new Game({ width: 390, height: 562, seed, tuning: { maxDt: 0.1, ...ov } });
  const p = g.player;
  let frames = 0;
  const maxFrames = 200 * 60; // 200 s cap (a good round ends ~75 s)
  while (g.state === 'playing' && frames < maxFrames) {
    // nearest target
    let best = null, bestD = Infinity;
    for (const tg of g.targets) {
      const d = Math.hypot(tg.x - p.x, tg.y - p.y);
      if (d < bestD) { bestD = d; best = tg; }
    }
    let input = { attack: false };
    if (best) {
      const dx = best.x - p.x, dy = best.y - p.y;
      const d = Math.hypot(dx, dy) || 1;
      const reach = g.attackRadius() + best.r; // arc reach
      const desired = reach * 0.72;            // stand mid-arc, outside contact range
      let mx, my;
      if (d > desired + 4) {
        // too far: chase
        mx = dx / d; my = dy / d;
      } else {
        // in position: strafe tangentially so facing keeps the target ahead
        const tx = -dy / d, ty = dx / d; // tangent (choose sign by which keeps target ahead)
        const face = Math.atan2(p.faceY, p.faceX);
        const angNow = Math.atan2(dy, dx);
        const aheadPos = Math.abs(angDiff(angNow + Math.PI / 2, face));
        const aheadNeg = Math.abs(angDiff(angNow - Math.PI / 2, face));
        const sign = aheadNeg < aheadPos ? -1 : 1;
        mx = tx * sign; my = ty * sign;
        // keep the gap roughly at `desired`
        if (d > desired) { mx += (dx / d) * 0.5; my += (dy / d) * 0.5; }
        else { mx -= (dx / d) * 0.5; my -= (dy / d) * 0.5; }
      }
      const m = Math.hypot(mx, my) || 1;
      input.moveX = mx / m; input.moveY = my / m;
      // attack when the target is inside arc reach and roughly ahead
      const facing = Math.atan2(p.faceY, p.faceX);
      const ang = Math.atan2(dy, dx);
      const ahead = Math.abs(angDiff(ang, facing)) < (2 * Math.PI / 3) * 0.55;
      if (d < reach * 1.05 && ahead) input.attack = true;
    }
    g.update(DT, input);
    frames++;
  }
  return g;
}

function angDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

const seeds = process.argv.slice(2).map(Number);
const list = seeds.length ? seeds : [1, 2, 3, 4, 5, 6, 7, 8];

let won = 0;
for (const seed of list) {
  const g = autoplay(seed);
  const verdict = g.state === 'won' ? 'WIN ' : g.state === 'lost' ? 'LOSE' : 'DRAW';
  const why = g.state === 'lost' ? ` (${g.loseReason} dead)` : '';
  const info = `seed=${seed} ${verdict}${why} t=${g.time.toFixed(1)}s kills=${g.kills} ` +
    `gateHP=${g.gate.hp}/12 playerHP=${g.player.hp}/6 targetsLeft=${g.targets.length}`;
  console.log(info);
  if (g.state === 'won') won++;
}
console.log(`\n${won}/${list.length} rounds won`);
process.exit(won === list.length ? 0 : 1);