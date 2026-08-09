/*
 * Canvas renderer. Pure drawing from core state — no game logic here.
 * fx: { particles: [...], playerFlashUntil, gateFlashUntil } maintained by main.js.
 */
(function () {
  'use strict';

  const M = Math;

  function draw(ctx, g, fx) {
    const W = g.width, H = g.height;

    // ---- background ----
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#101828');
    bg.addColorStop(1, '#0a0d14');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = '#7dd3fc';
    ctx.fillRect(0, 0, W, 2); // subtle top edge light
    ctx.globalAlpha = 1;

    drawGate(ctx, g, fx);
    drawTargets(ctx, g);
    drawAttackSector(ctx, g);
    drawPlayer(ctx, g);
    drawHud(ctx, g);
    drawParticles(ctx, fx.particles);

    if (g.state !== 'playing') drawOverlay(ctx, g);
  }

  function drawGate(ctx, g, fx) {
    const top = g.gate.top;
    const W = g.width;
    const bandH = g.height - top;
    const hp = g.gate.hp, max = g.gate.maxHp;

    // band between the double lines
    ctx.fillStyle = '#1c2230';
    ctx.fillRect(0, top, W, bandH);

    // hp segments (12) between the lines
    const segGap = 3;
    const segW = (W - 24 - segGap * (max - 1)) / max;
    const segY = top + bandH * 0.32;
    const segH = bandH * 0.36;
    for (let i = 0; i < max; i++) {
      const x = 12 + i * (segW + segGap);
      ctx.fillStyle = i < hp ? (fx.gateFlashUntil && fx.gateFlashUntil > g.time ? '#fca5a5' : '#eab308') : '#272e3d';
      ctx.fillRect(x, segY, segW, segH);
    }

    // the double lines themselves
    ctx.fillStyle = '#94a3b8';
    ctx.fillRect(0, top, W, 2.5);
    ctx.fillRect(0, g.height - 3, W, 3);

    // damage flash on the band
    if (fx.gateFlashUntil && fx.gateFlashUntil > g.time) {
      const a = Math.min(1, (fx.gateFlashUntil - g.time) / 0.25) * 0.35;
      ctx.fillStyle = `rgba(248,113,113,${a})`;
      ctx.fillRect(0, top, W, bandH);
    }
  }

  function drawTargets(ctx, g) {
    const s = Math.sqrt(3) / 2; // sin(60deg)
    for (const tg of g.targets) {
      ctx.beginPath();
      ctx.moveTo(tg.x, tg.y + tg.r);            // tip, pointing down
      ctx.lineTo(tg.x - s * tg.r, tg.y - tg.r / 2);
      ctx.lineTo(tg.x + s * tg.r, tg.y - tg.r / 2);
      ctx.closePath();
      ctx.fillStyle = '#f87171';
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = '#7f1d1d';
      ctx.stroke();
    }
  }

  function drawAttackSector(ctx, g) {
    const s = g.attackSector();
    if (!s) return;
    ctx.beginPath();
    ctx.moveTo(s.cx, s.cy);
    ctx.arc(s.cx, s.cy, s.radius, s.startAngle, s.endAngle);
    ctx.closePath();
    ctx.fillStyle = 'rgba(125, 211, 252, 0.20)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(125, 211, 252, 0.65)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  function drawPlayer(ctx, g) {
    const p = g.player;
    // body
    const grad = ctx.createRadialGradient(p.x - p.r * 0.3, p.y - p.r * 0.35, p.r * 0.2, p.x, p.y, p.r);
    grad.addColorStop(0, '#bae6fd');
    grad.addColorStop(1, '#38bdf8');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, 2 * Math.PI);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#e0f2fe';
    ctx.stroke();

    // direction notch (shows where the arc faces)
    const fa = g.facingAngle();
    const nx = M.cos(fa), ny = M.sin(fa);
    ctx.beginPath();
    ctx.moveTo(p.x + nx * p.r, p.y + ny * p.r);
    ctx.lineTo(p.x + nx * p.r - ny * 5, p.y + ny * p.r + nx * 5);
    ctx.lineTo(p.x + nx * p.r + ny * 5, p.y + ny * p.r - nx * 5);
    ctx.closePath();
    ctx.fillStyle = '#0b1220';
    ctx.fill();

    // hp gauge (6 segments) below the character
    const segs = 6, gap = 2.5, sw = p.r * 0.52, sh = 4.5, y = p.y + p.r + 7;
    const total = segs * sw + (segs - 1) * gap;
    const x0 = p.x - total / 2;
    for (let i = 0; i < segs; i++) {
      ctx.fillStyle = i < p.hp ? '#4ade80' : '#252c3b';
      ctx.fillRect(x0 + i * (sw + gap), y, sw, sh);
    }
  }

  function drawHud(ctx, g) {
    ctx.font = '600 13px ui-monospace, Menlo, Consolas, monospace';
    ctx.textBaseline = 'top';
    const left = g.spawnTimeLeft().toFixed(0);
    ctx.fillStyle = 'rgba(226,232,240,0.85)';
    ctx.textAlign = 'left';
    ctx.fillText(`TIME ${left}`, 12, 10);
    ctx.textAlign = 'right';
    ctx.fillText(`LEFT ${g.targetsRemaining()}`, g.width - 12, 10);
  }

  function drawParticles(ctx, parts) {
    for (const pt of parts) {
      const k = pt.t / pt.dur;
      if (k >= 1) continue;
      ctx.globalAlpha = 1 - k;
      ctx.strokeStyle = pt.color;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 4 + k * pt.r, 0, 2 * Math.PI);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function drawOverlay(ctx, g) {
    ctx.fillStyle = 'rgba(5, 8, 14, 0.55)';
    ctx.fillRect(0, 0, g.width, g.height);

    const won = g.state === 'won';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '800 34px system-ui, sans-serif';
    ctx.fillStyle = won ? '#4ade80' : '#f87171';
    ctx.fillText(won ? 'VICTORY' : 'DEFEAT', g.width / 2, g.height * 0.42);

    ctx.font = '500 14px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(226,232,240,0.75)';
    const why = won
      ? 'The horde is destroyed — the gate stands'
      : g.loseReason === 'gate'
        ? 'The gate has fallen'
        : 'You have been overwhelmed';
    ctx.fillText(why, g.width / 2, g.height * 0.42 + 30);

    ctx.font = '600 15px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(226,232,240,0.9)';
    ctx.fillText('tap to play again', g.width / 2, g.height * 0.55);
  }

  window.MBLRender = { draw };
})();