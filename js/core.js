/*
 * Monster Ball Launcher — game core.
 *
 * Pure logic, no DOM: runs in Node (module.exports) and in the browser
 * (window.MBL). All game rules from the spec live here; the renderer and
 * input layers are thin shells over this.
 *
 * Spec summary (Monster Gate defense):
 *  - Player = circle at bottom, moved by joystick, attacks with buttons.
 *  - Attack = arc of radius 2x player radius, 1/3 of a circumference (120 deg),
 *    facing the direction of movement; every target touching it takes 1 damage
 *    (targets have 1 HP -> destroyed).
 *  - Targets = downward triangles, spawn 3 at a time every 2 s for 60 s at
 *    random x along the top, descend, and stop in contact with the gate.
 *  - Contact damage: 1 per second, starting at first contact, per target,
 *    against whichever of player/gate it overlaps.
 *  - Player HP 6, gate HP 12. Win: gate alive when all targets destroyed.
 *    Lose: player HP <= 0, or gate HP <= 0 (while targets remain).
 */
(function (global) {
  'use strict';

  const TAU = Math.PI * 2;

  // ---- balance knobs (spec-derived values are marked "(spec)") ----
  const TUNING = {
    playerRadius: 16,          // px
    playerMaxSpeed: 340,       // px/s at full deflection (tuned: 8/8 autoplay wins)
    targetCircumradius: 13,    // px; equilateral triangle bounding circle
    targetSpeedFrac: 0.065,    // fraction of game-area height per second (tuned)
    attackDuration: 0.22,      // s the arc stays active per swing
    attackCooldown: 0.3,       // s between swings
    gateBandHeight: 16,        // px height of the gate double-line at the bottom
    // ---- spec ----
    playerMaxHp: 6,            // (spec)
    gateMaxHp: 12,             // (spec)
    waveSize: 3,               // (spec) targets per wave
    waveInterval: 2,           // (spec) seconds between waves
    spawnDuration: 60,         // (spec) seconds of spawning
    targetDamage: 1,           // (spec)
    targetHitInterval: 1,      // (spec) seconds between contact hits
    attackRadiusFactor: 2,     // (spec) arc radius = factor * player radius
    attackArcFraction: 1 / 3,  // (spec) fraction of circumference -> 120 deg
    maxDt: 0.1,                // clamp on update(dt) to survive render stalls
  };

  const ATTACK_ANGLE = TUNING.attackArcFraction * TAU; // 2*PI/3 = 120 deg
  const TOTAL_WAVES = Math.ceil(TUNING.spawnDuration / TUNING.waveInterval); // 30

  // Deterministic RNG so tests/autoplay are reproducible.
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function dist(ax, ay, bx, by) { return Math.hypot(bx - ax, by - ay); }

  // Boundary grace so a tick due exactly at `t` fires at the t frame, not t+1 frame.
  const EPS = 1e-9;

  // Signed shortest angle from a to b, in [-PI, PI].
  function angleDiff(a, b) {
    let d = (a - b) % TAU;
    if (d > Math.PI) d -= TAU;
    if (d < -Math.PI) d += TAU;
    return d;
  }

  class Game {
    constructor(opts = {}) {
      this.width = opts.width ?? 390;
      this.height = opts.height ?? 562;
      this.tuning = Object.assign({}, TUNING, opts.tuning || {});
      this.rng = opts.rng || mulberry32(opts.seed ?? 1);
      this.time = 0;
      this.state = 'playing'; // 'playing' | 'won' | 'lost'
      this.loseReason = null; // 'player' | 'gate'
      this.events = [];       // drained each update for particles/sfx
      this.kills = 0;
      this.damageTaken = 0;
      this.gateDamage = 0;

      const t = this.tuning;
      this.gate = {
        hp: t.gateMaxHp,
        maxHp: t.gateMaxHp,
        top: this.height - t.gateBandHeight, // top line of the double line
      };
      this.player = {
        x: this.width / 2,
        y: this.gate.top - t.playerRadius * 3, // start a little above the gate
        r: t.playerRadius,
        hp: t.playerMaxHp,
        maxHp: t.playerMaxHp,
        faceX: 0, faceY: -1,       // default facing: up
        attackActive: false,
        attackUntil: -1,
        attackCooldownUntil: -1,
      };
      this.targets = [];
      this.wavesSpawned = 0;
      this.nextWaveAt = t.waveInterval; // first wave at t=2 s
      this.targetSpeed = t.targetSpeedFrac * this.height;
    }

    /** Recompute size-dependent state (screen rotated/resized). Preserves HP. */
    resize(width, height) {
      const t = this.tuning;
      this.width = width;
      this.height = height;
      this.gate.top = height - t.gateBandHeight;
      this.targetSpeed = t.targetSpeedFrac * height;
      const p = this.player;
      p.x = clamp(p.x, p.r, width - p.r);
      p.y = clamp(p.y, p.r, this.gate.top - p.r);
    }

    /**
     * Advance the simulation.
     * input: { moveX, moveY in [-1,1] (joystick), attack: boolean (button held) }
     */
    update(dt, input = {}) {
      if (this.state !== 'playing') return;
      const t = this.tuning;
      dt = clamp(dt, 0, t.maxDt);
      this.events.length = 0;
      this.time += dt;

      const p = this.player;
      const gateTop = this.gate.top;

      // ---- spawning: 3 targets every 2 s for 60 s ----
      while (this.wavesSpawned < TOTAL_WAVES && this.time + EPS >= this.nextWaveAt) {
        this.spawnWave();
        this.wavesSpawned++;
        this.nextWaveAt = (this.wavesSpawned + 1) * t.waveInterval; // waves at 2,4,...,60
      }

      // ---- player movement (joystick) + facing follows movement ----
      const mx = clamp(input.moveX ?? 0, -1, 1);
      const my = clamp(input.moveY ?? 0, -1, 1);
      const mag = Math.hypot(mx, my);
      if (mag > 0.05) {
        p.x += mx * t.playerMaxSpeed * dt;
        p.y += my * t.playerMaxSpeed * dt;
        p.faceX = mx / mag;
        p.faceY = my / mag;
      }
      p.x = clamp(p.x, p.r, this.width - p.r);
      p.y = clamp(p.y, p.r, gateTop - p.r);

      // ---- attack: swing the arc on press/hold, gated by cooldown ----
      if (input.attack && this.time + EPS >= p.attackCooldownUntil) {
        p.attackActive = true;
        p.attackUntil = this.time + t.attackDuration;
        p.attackCooldownUntil = this.time + t.attackCooldown;
      }
      if (this.time >= p.attackUntil) p.attackActive = false;

      if (p.attackActive) {
        const facing = Math.atan2(p.faceY, p.faceX);
        const radius = p.r * t.attackRadiusFactor;
        for (let i = this.targets.length - 1; i >= 0; i--) {
          const tg = this.targets[i];
          if (this.sectorContains(p.x, p.y, facing, radius, tg)) {
            this.targets.splice(i, 1);
            this.kills++;
            this.events.push({ type: 'destroy', x: tg.x, y: tg.y });
          }
        }
      }

      // ---- targets: descend, stop at the gate, deal contact damage ----
      for (let i = 0; i < this.targets.length; i++) {
        const tg = this.targets[i];

        tg.y += this.targetSpeed * dt;
        if (tg.y + tg.r >= gateTop) tg.y = gateTop - tg.r; // stop touching the gate

        const playerOverlap = dist(p.x, p.y, tg.x, tg.y) <= p.r + tg.r;
        const gateOverlap = tg.y + tg.r >= gateTop;

        // 1 damage per second, starting at first contact (per target per victim)
        if (playerOverlap) {
          if (this.time + EPS >= tg.nextPlayerHitAt) {
            p.hp -= t.targetDamage;
            this.damageTaken += t.targetDamage;
            this.events.push({ type: 'player-hit', x: p.x, y: p.y });
            tg.nextPlayerHitAt = this.time + t.targetHitInterval;
            if (p.hp <= 0) { this.state = 'lost'; this.loseReason = 'player'; return; }
          }
        } else {
          tg.nextPlayerHitAt = this.time; // hit immediately on (re)contact
        }

        if (gateOverlap) {
          if (this.time + EPS >= tg.nextGateHitAt) {
            this.gate.hp -= t.targetDamage;
            this.gateDamage += t.targetDamage;
            this.events.push({ type: 'gate-hit' });
            tg.nextGateHitAt = this.time + t.targetHitInterval;
            if (this.gate.hp <= 0) { this.state = 'lost'; this.loseReason = 'gate'; return; }
          }
        } else {
          tg.nextGateHitAt = this.time;
        }
      }

      // ---- win: every target destroyed, spawning phase over, gate alive ----
      if (this.wavesSpawned >= TOTAL_WAVES && this.targets.length === 0) {
        this.state = 'won';
      }
    }

    /** Spawn one wave: `waveSize` targets at random x along the top edge. */
    spawnWave() {
      const t = this.tuning;
      const r = t.targetCircumradius;
      for (let i = 0; i < t.waveSize; i++) {
        this.targets.push({
          x: r + this.rng() * (this.width - 2 * r),
          y: -r,
          r,
          nextPlayerHitAt: 0,
          nextGateHitAt: 0,
        });
      }
    }

    /** True when circle (cx,cy,r) overlaps the 120-deg sector of `radius`. */
    sectorContains(cx, cy, facingAngle, radius, tg) {
      const d = dist(cx, cy, tg.x, tg.y);
      if (d > radius + tg.r) return false;
      const half = ATTACK_ANGLE / 2;
      const ang = Math.atan2(tg.y - cy, tg.x - cx);
      // angular half-width of the target as seen from the player
      const slop = d > 1e-6 ? Math.asin(clamp(tg.r / d, 0, 1)) : half;
      return Math.abs(angleDiff(ang, facingAngle)) <= half + slop;
    }

    // ---- read-only helpers for the renderer ----
    facingAngle() { return Math.atan2(this.player.faceY, this.player.faceX); }
    attackRadius() { return this.player.r * this.tuning.attackRadiusFactor; }
    attackSector() {
      if (!this.player.attackActive) return null;
      const a = this.facingAngle();
      const half = ATTACK_ANGLE / 2;
      return {
        cx: this.player.x, cy: this.player.y, radius: this.attackRadius(),
        startAngle: a - half, endAngle: a + half,
      };
    }
    targetsRemaining() { return this.targets.length; }
    spawnTimeLeft() { return Math.max(0, TOTAL_WAVES * this.tuning.waveInterval - this.time); }
  }

  const api = { Game, TUNING, ATTACK_ANGLE, TOTAL_WAVES, mulberry32 };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.MBL = api;
})(typeof window !== 'undefined' ? window : globalThis);