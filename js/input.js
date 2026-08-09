/*
 * Input layer: virtual joystick (left) + two attack buttons (right, stacked)
 * + desktop keyboard fallback. Outputs a plain input object for the core:
 *   { moveX, moveY in [-1,1], attack: boolean }
 * Multi-touch safe: each pointer is tracked by id.
 */
(function () {
  'use strict';

  const input = { moveX: 0, moveY: 0, attack: false };

  function initJoystick(zone, base, knob) {
    let pointerId = null;
    let baseRect = null;

    function home() {
      knob.style.transform = 'translate(0, 0)';
    }
    home();

    zone.addEventListener('pointerdown', (e) => {
      if (pointerId !== null) return; // only one stick finger
      pointerId = e.pointerId;
      zone.setPointerCapture(pointerId);
      baseRect = base.getBoundingClientRect();
    });

    zone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== pointerId) return;
      const maxR = baseRect.width * 0.28; // deflection that = full speed (knob stays in base)
      let dx = (e.clientX - (baseRect.left + baseRect.width / 2));
      let dy = (e.clientY - (baseRect.top + baseRect.height / 2));
      const d = Math.hypot(dx, dy);
      if (d > maxR) { dx = (dx / d) * maxR; dy = (dy / d) * maxR; } // clamp knob to base
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      input.moveX = dx / maxR;
      input.moveY = dy / maxR;
    });

    function release(e) {
      if (e.pointerId !== pointerId) return;
      pointerId = null;
      home();
      input.moveX = 0;
      input.moveY = 0;
    }
    zone.addEventListener('pointerup', release);
    zone.addEventListener('pointercancel', release);
    zone.addEventListener('pointerleave', release);
  }

  function initButton(btn) {
    let held = false;
    const press = (e) => {
      e.preventDefault();
      held = true;
      btn.classList.add('pressed');
      btn.setPointerCapture(e.pointerId);
      input.attack = true;
    };
    const release = (e) => {
      if (!held) return;
      held = false;
      btn.classList.remove('pressed');
      input.attack = false;
    };
    btn.addEventListener('pointerdown', press);
    btn.addEventListener('pointerup', release);
    btn.addEventListener('pointercancel', release);
  }

  function initKeyboard() {
    const keys = {
      ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1],
      a: [-1, 0], d: [1, 0], w: [0, -1], s: [0, 1],
    };
    const held = new Set();
    const attackKeys = new Set([' ', 'j', 'k', 'Enter']);

    const recompute = () => {
      let x = 0, y = 0;
      for (const k of held) {
        const v = keys[k];
        if (v) { x += v[0]; y += v[1]; }
      }
      input.moveX = x === 0 ? 0 : x / Math.hypot(x, y);
      input.moveY = y === 0 ? 0 : y / Math.hypot(x, y);
    };

    window.addEventListener('keydown', (e) => {
      if (keys[e.key]) {
        e.preventDefault();
        held.add(e.key);
        recompute();
      } else if (attackKeys.has(e.key)) {
        e.preventDefault();
        input.attack = true;
      }
    });
    window.addEventListener('keyup', (e) => {
      if (keys[e.key]) { held.delete(e.key); recompute(); }
      else if (attackKeys.has(e.key)) input.attack = false;
    });
    window.addEventListener('blur', () => { held.clear(); input.moveX = 0; input.moveY = 0; input.attack = false; });
  }

  window.MBLInput = {
    input,
    init(zone, base, knob, btnA, btnB) {
      initJoystick(zone, base, knob);
      initButton(btnA);
      initButton(btnB);
      initKeyboard();
      return input;
    },
  };
})();