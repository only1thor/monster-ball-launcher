/*
 * Glue: canvas sizing, game loop, event -> particle effects, restart.
 */
(function () {
  'use strict';

  const area = document.getElementById('game-area');
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const zone = document.getElementById('joystick-zone');
  const base = document.getElementById('joystick-base');
  const knob = document.getElementById('joystick-knob');
  const btnA = document.getElementById('btn-a');
  const btnB = document.getElementById('btn-b');

  const input = window.MBLInput.init(zone, base, knob, btnA, btnB);

  let game = null;
  let fx = freshFx();

  function freshFx() {
    return { particles: [], playerFlashUntil: 0, gateFlashUntil: 0 };
  }

  function newGame(w, h) {
    game = new window.MBL.Game({ width: w, height: h });
    fx = freshFx();
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = area.clientWidth;
    const h = area.clientHeight;
    canvas.width = Math.max(1, Math.round(w * dpr));
    canvas.height = Math.max(1, Math.round(h * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (game) game.resize(w, h);
    else newGame(w, h);
  }

  if (window.ResizeObserver) {
    new ResizeObserver(resize).observe(area);
  } else {
    window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', resize);
  }
  resize();

  // tap to restart after game over
  canvas.addEventListener('pointerdown', () => {
    if (game && game.state !== 'playing') newGame(game.width, game.height);
  });

  function drainEvents() {
    for (const ev of game.events) {
      if (ev.type === 'destroy') {
        fx.particles.push({ x: ev.x, y: ev.y, t: 0, dur: 0.35, r: 26, color: '#fca5a5' });
      } else if (ev.type === 'player-hit') {
        fx.playerFlashUntil = game.time + 0.3;
        fx.particles.push({ x: ev.x, y: ev.y, t: 0, dur: 0.3, r: 30, color: '#f87171' });
      } else if (ev.type === 'gate-hit') {
        fx.gateFlashUntil = game.time + 0.25;
      }
    }
    fx.particles = fx.particles.filter((p) => (p.t += 1 / 60) < p.dur);
  }

  let last = performance.now();
  function loop(now) {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    if (game) {
      if (game.state === 'playing') {
        game.update(dt, input);
        drainEvents();
      }
      window.MBLRender.draw(ctx, game, fx);
    }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
})();