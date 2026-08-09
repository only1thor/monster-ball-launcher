'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Game, TUNING, ATTACK_ANGLE, TOTAL_WAVES } = require('../js/core.js');

const W = 390, H = 562;
const DT = 0.05; // exact in binary -> exact timing in tests

function makeGame(seed = 7, opts = {}) {
  const { tuning, ...rest } = opts;
  return new Game({ width: W, height: H, seed, tuning: { maxDt: 60, ...tuning }, ...rest });
}

/** Run `seconds` of updates in fixed DT steps; inputFn(game) runs before each step. */
function run(game, seconds, inputFn = () => ({})) {
  const steps = Math.max(1, Math.ceil(seconds / DT));
  for (let i = 0; i < steps; i++) {
    const input = inputFn(game);
    game.update(DT, input);
  }
}

/** Replace the field with a single target at (x, y) and return it. */
function soloTarget(g, x, y) {
  g.targets.length = 0;
  g.spawnWave();
  g.targets = g.targets.slice(-1);
  const tg = g.targets[0];
  tg.x = x;
  tg.y = y;
  return tg;
}

/** Park a target resting against the gate at x and hover the player just above it
 *  so the two overlap. Target is stationary, so contact damage cadence is exact. */
function overlapPlayerAndRestingTarget(g, targetX) {
  const tg = soloTarget(g, targetX, g.gate.top - g.tuning.targetCircumradius);
  g.player.y = g.gate.top - g.player.r - 2;
  g.player.x = targetX;
  return tg;
}

test('config: spec quantities are wired up', () => {
  assert.equal(TUNING.playerMaxHp, 6);
  assert.equal(TUNING.gateMaxHp, 12);
  assert.equal(TUNING.waveSize, 3);
  assert.equal(TUNING.waveInterval, 2);
  assert.equal(TUNING.spawnDuration, 60);
  assert.equal(TUNING.attackRadiusFactor, 2);
  assert.equal(TOTAL_WAVES, 30);
  assert.equal(Math.abs(ATTACK_ANGLE - (2 * Math.PI) / 3) < 1e-9, true, 'arc = 1/3 of circumference = 120deg');
});

test('spawning: 3 targets every 2 s for 60 s = 30 waves, 90 targets, random in-bounds x', () => {
  // Schedule test: invulnerable player+gate so a no-kill 60 s sim stays alive.
  const g = makeGame(7, { tuning: { playerMaxHp: 1e6, gateMaxHp: 1e6 } });
  run(g, 61);
  assert.equal(g.wavesSpawned, 30);
  assert.equal(g.targets.length, 90);
  for (const tg of g.targets) {
    assert.ok(tg.x >= tg.r - 1e-9 && tg.x <= W - tg.r + 1e-9, 'target x in bounds');
    assert.ok(tg.y <= g.gate.top + 1e-9, 'target never below the gate top line');
  }
});

test('spawning: waves arrive on the 2 s schedule (first at t=2, last at t=60)', () => {
  const g = makeGame(7, { tuning: { playerMaxHp: 1e6, gateMaxHp: 1e6 } });
  g.update(1.9, {});       // t=1.9
  assert.equal(g.targets.length, 0, 'no wave before t=2');
  g.update(0.1, {});       // t=2.0 -> wave 1
  assert.equal(g.targets.length, 3, 'wave 1 spawns exactly 3');
  g.update(1.9, {});
  assert.equal(g.targets.length, 3, 'no wave at t=3.9');
  g.update(0.1, {});       // t=4.0 -> wave 2
  assert.equal(g.targets.length, 6, 'wave 2 spawns exactly 3 more');
  g.update(20, {});        // t=24 -> waves 3..12
  assert.equal(g.wavesSpawned, 12);
  g.update(36, {});        // t=60 -> waves 13..30
  assert.equal(g.wavesSpawned, 30);
  g.update(2, {});         // t=62, spawning phase over
  assert.equal(g.wavesSpawned, 30, 'no waves after t=60');
  assert.equal(g.targets.length, 90);
});

test('targets: descend at constant speed, then stop in contact with the gate', () => {
  const g = makeGame();
  const tg = soloTarget(g, 100, -g.tuning.targetCircumradius);
  const speed = g.targetSpeed;
  g.update(DT, {});
  assert.ok(Math.abs(tg.y - (-tg.r + speed * DT)) < 1e-6, 'moves down');
  assert.equal(tg.x, 100, 'no sideways drift');
  run(g, 20);              // long past crossing time
  assert.ok(Math.abs(tg.y - (g.gate.top - tg.r)) < 1e-6, 'rests on the gate (tip touching top line)');
  const y = tg.y;
  run(g, 3, () => ({}));
  assert.equal(tg.y, y, 'does not move once resting');
});

test('gate: resting target deals 1 damage on first contact, then 1/s', () => {
  const g = makeGame();
  const tg = soloTarget(g, W / 2, g.gate.top - g.tuning.targetCircumradius);
  const hits = []; // [time, gateDamage]
  for (let i = 0; i < 200 && hits.length < 4; i++) {
    g.update(0.1, {});
    if (g.gateDamage > (hits.length ? hits[hits.length - 1][1] : 0)) {
      hits.push([g.time, g.gateDamage]);
    }
  }
  assert.ok(hits.length >= 4, 'gate keeps taking damage over time, got ' + hits.length);
  assert.equal(hits[0][1], 1, '1 damage at first contact');
  for (let i = 1; i < hits.length; i++) {
    assert.equal(hits[i][1], hits[i - 1][1] + 1, 'damage increments by exactly 1');
    assert.ok(hits[i][0] - hits[i - 1][0] >= 0.999, `hits ${hits[i][0] - hits[i - 1][0]}s apart (>= 1s)`);
  }
});

test('player: target contact deals 1 immediately, then 1/s, not per-frame', () => {
  const g = makeGame();
  overlapPlayerAndRestingTarget(g, W / 2);
  g.update(DT, {});
  assert.equal(g.player.hp, 5, 'immediate 1 dmg on first contact');
  g.update(DT, {});
  assert.equal(g.player.hp, 5, 'no per-frame damage');
  run(g, 0.9, () => ({}));
  assert.equal(g.player.hp, 5, 'no second hit before 1 s');
  run(g, 0.15, () => ({}));
  assert.equal(g.player.hp, 4, 'second hit after ~1 s');
});

test('player: contact damage timer resets when contact breaks and resumes', () => {
  const g = makeGame();
  const tg = overlapPlayerAndRestingTarget(g, W / 2);
  g.update(DT, {});
  assert.equal(g.player.hp, 5);
  tg.x = W / 2 + 200;      // break contact
  run(g, 0.5, () => ({}));
  assert.equal(g.player.hp, 5);
  tg.x = W / 2;            // resume contact -> immediate hit
  g.update(DT, {});
  assert.equal(g.player.hp, 4);
});

test('attack: arc destroys targets inside the sector (1 damage = death)', () => {
  const g = makeGame();
  soloTarget(g, g.player.x + 30, g.player.y); // 30px right, arc radius = 2r = 32
  g.update(0, { moveX: 1, moveY: 0 });         // face right
  g.update(DT, { attack: true });
  assert.equal(g.targets.length, 0, 'in-arc target destroyed');
  assert.equal(g.kills, 1);
});

test('attack: respects facing — target 90 deg off is not hit', () => {
  const g = makeGame();
  soloTarget(g, g.player.x, g.player.y - 30); // straight up = 90 deg off from facing right
  g.update(0, { moveX: 1, moveY: 0 });
  g.update(DT, { attack: true });
  assert.equal(g.targets.length, 1, 'target not in arc');
});

test('attack: respects radius — target beyond 2r+targetR survives', () => {
  const g = makeGame();
  const tg = soloTarget(g, 0, g.player.y);
  g.update(0, { moveX: 1, moveY: 0 });
  tg.x = g.player.x + g.attackRadius() + tg.r + 5;
  g.update(DT, { attack: true });
  assert.equal(g.targets.length, 1);
});

test('attack: facing follows movement, persists when stationary', () => {
  const g = makeGame();
  soloTarget(g, g.player.x + 30, g.player.y);
  g.update(0, { moveX: 1, moveY: 0 }); // face right
  g.update(0, {});                     // stop; facing kept
  g.update(DT, { attack: true });
  assert.equal(g.targets.length, 0, 'arc still faces last movement direction');
});

test('attack: swing is time-limited — no damage while the arc is inactive', () => {
  const g = makeGame();
  const dur = g.tuning.attackDuration;
  const cd = g.tuning.attackCooldown;
  soloTarget(g, g.player.x, g.player.y + 10); // below player, face down
  g.update(0, { moveX: 0, moveY: 1 });
  g.update(DT, { attack: true });             // swing starts, hits
  assert.equal(g.targets.length, 0, 'hit while swing active');
  run(g, dur + 0.05, () => ({}));             // swing expired, no attack pressed
  soloTarget(g, g.player.x, g.player.y + 10);
  run(g, cd + 0.05, () => ({}));              // cooldown elapses, still no attack
  assert.equal(g.targets.length, 1, 'no damage while arc inactive');
  g.update(DT, { attack: true });             // fresh swing works again
  assert.equal(g.targets.length, 0, 'swing works after cooldown');
  run(g, dur + 0.05, () => ({}));             // let it expire
  soloTarget(g, g.player.x, g.player.y + 10);
  run(g, 0.3, () => ({}));                    // no input at all
  assert.equal(g.targets.length, 1, 'still no damage without attack input');
});

test('attack: cooldown gates swings; holding re-fires at cooldown cadence', () => {
  const g = makeGame();
  const dur = g.tuning.attackDuration;
  const cd = g.tuning.attackCooldown;
  g.update(0, { attack: true });
  const endsAt = g.player.attackUntil;
  run(g, dur / 2, () => ({ attack: true })); // spam during the swing
  assert.equal(g.player.attackUntil, endsAt, 'spam does not extend the active swing');
  run(g, cd + 0.1, () => ({}));              // let swing + cooldown elapse, no input
  assert.equal(g.player.attackActive, false, 'swing ended by itself');
  g.update(DT, { attack: true });            // press again after cooldown
  assert.equal(g.player.attackActive, true, 'next swing starts once cooldown elapsed');
});

test('player cannot damage the gate', () => {
  const g = makeGame();
  soloTarget(g, g.player.x, g.player.y + 5);
  g.player.y = g.gate.top - g.player.r - 5;   // hover just above the gate
  g.update(0, { moveX: 0, moveY: 1 });         // face down
  g.update(DT, { attack: true });
  assert.equal(g.gate.hp, TUNING.gateMaxHp, 'gate HP untouched');
});

test('lose: player takes 6 damage -> lost', () => {
  const g = makeGame();
  overlapPlayerAndRestingTarget(g, W / 2);
  run(g, 5.1, () => ({})); // hits at 0.05,1.05,...,5.05 -> 6 hits
  assert.equal(g.state, 'lost');
  assert.equal(g.loseReason, 'player');
  assert.equal(g.player.hp, 0);
});

test('lose: gate loses 12 damage while targets remain -> lost', () => {
  const g = makeGame();
  for (let i = 0; i < 6; i++) g.spawnWave(); // 18 targets
  g.targets.forEach((tg, i) => {
    tg.x = 20 + i * 15;                      // spread across the gate
    tg.y = g.gate.top - tg.r;
  });
  run(g, 2, () => ({})); // 18 dmg/s, gate (12 HP) dies in < 1 s
  assert.equal(g.state, 'lost');
  assert.equal(g.loseReason, 'gate');
  assert.ok(g.gate.hp <= 0);
});

test('win: all targets destroyed after spawning phase ends -> won', () => {
  const g = makeGame();
  g.wavesSpawned = TOTAL_WAVES;  // spawning phase complete
  g.targets.length = 0;          // field cleared
  assert.equal(g.state, 'playing', 'still playing before the check runs');
  g.update(DT, {});
  assert.equal(g.state, 'won');
  assert.ok(g.gate.hp > 0);
  assert.ok(g.player.hp > 0);
});

test('no win before spawning phase is over', () => {
  const g = makeGame();
  g.spawnWave();
  g.targets.length = 0;
  run(g, 0.1, () => ({}));
  assert.equal(g.state, 'playing', 'early clear is not a win');
});

test('state is frozen after game over', () => {
  const g = makeGame();
  g.wavesSpawned = TOTAL_WAVES;
  g.targets.length = 0;
  g.update(DT, {});
  assert.equal(g.state, 'won');
  const x = g.player.x;
  g.update(DT, { attack: true, moveX: 1, moveY: 0 });
  assert.equal(g.player.x, x, 'no movement after game over');
  assert.equal(g.targets.length, 0, 'no spawns after game over');
  assert.equal(g.state, 'won');
});

test('resize keeps targets/HP and recomputes geometry', () => {
  const g = makeGame();
  g.player.x = 5; // force out of new bounds
  g.resize(300, 400);
  assert.equal(g.width, 300);
  assert.equal(g.height, 400);
  assert.equal(g.gate.top, 400 - g.tuning.gateBandHeight);
  assert.equal(g.player.x, g.player.r, 'player clamped on resize');
  assert.equal(g.gate.hp, TUNING.gateMaxHp);
});