/* =========================================================================
 * AMBIENT MANN — bevegelig «universe»-bakgrunn
 * Lett, GPU-vennlig stjernehimmel på <canvas> med parallax-drift + blink.
 * VIKTIG: canvas er GJENNOMSIKTIG (ingen solid fyll) slik at det opplastede
 * bakgrunnsbildet (assets/universe-bg.jpg) synes gjennom, mens stjernene
 * beveger seg oppå det.
 * ========================================================================= */
(function () {
  const canvas = document.getElementById('starfield');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  let w, h, dpr, stars = [], nebulae = [];
  const STAR_COUNT = 220;

  // Sjeldne stjerneskudd (meteorer) som streifer over innimellom.
  let shooting = [];
  let nextShoot = 4;

  function rand(a, b) { return a + Math.random() * (b - a); }

  function spawnShoot() {
    const down = Math.PI * rand(0.12, 0.38);   // vinkel nedover
    const dir = Math.random() < 0.5 ? 1 : -1;  // mot høyre eller venstre
    const speed = rand(7, 12) * dpr;
    shooting.push({
      x: dir > 0 ? rand(0, w * 0.5) : rand(w * 0.5, w),
      y: rand(0, h * 0.4),
      vx: dir * Math.cos(down) * speed,
      vy: Math.sin(down) * speed,
      len: rand(140, 280) * dpr,
      life: 1,
    });
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = canvas.width = Math.floor(innerWidth * dpr);
    h = canvas.height = Math.floor(innerHeight * dpr);
    canvas.style.width = innerWidth + 'px';
    canvas.style.height = innerHeight + 'px';
    build();
  }

  function build() {
    stars = [];
    for (let i = 0; i < STAR_COUNT; i++) {
      stars.push({
        x: Math.random() * w,
        y: Math.random() * h,
        z: rand(0.2, 1),            // dybde (parallax + størrelse)
        tw: rand(0, Math.PI * 2),   // blinkfase
        tws: rand(0.6, 2.2),        // blinkfart
      });
    }
    // Svake fargeskyer (nebula) for dybde – halvgjennomsiktige så bildet synes.
    nebulae = [
      { x: w * 0.2,  y: h * 0.25, r: Math.max(w, h) * 0.45, c: '80,120,255' },
      { x: w * 0.8,  y: h * 0.7,  r: Math.max(w, h) * 0.5,  c: '150,90,255' },
      { x: w * 0.55, y: h * 0.15, r: Math.max(w, h) * 0.35, c: '90,220,255' },
    ];
  }

  let t = 0;
  function frame() {
    t += 0.016;
    // Gjennomsiktig: nullstill, IKKE fyll svart (bakgrunnsbildet skal synes).
    ctx.clearRect(0, 0, w, h);

    // nebula-glød (svak)
    for (const n of nebulae) {
      const g = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.r);
      g.addColorStop(0, `rgba(${n.c},0.08)`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }

    // stjerner
    for (const s of stars) {
      s.y += s.z * 0.12 * dpr;          // langsom drift nedover
      if (s.y > h) { s.y = 0; s.x = Math.random() * w; }
      const a = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * s.tws + s.tw));
      const r = s.z * 1.6 * dpr;
      ctx.beginPath();
      ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(200,228,255,${a * s.z})`;
      ctx.fill();
    }

    // stjerneskudd — sjeldne, dukker opp innimellom
    nextShoot -= 0.016;
    if (nextShoot <= 0) { spawnShoot(); nextShoot = rand(7, 18); }
    for (let i = shooting.length - 1; i >= 0; i--) {
      const m = shooting[i];
      m.x += m.vx; m.y += m.vy; m.life -= 0.012;
      const d = Math.hypot(m.vx, m.vy) || 1;
      const tx = m.x - (m.vx / d) * m.len, ty = m.y - (m.vy / d) * m.len;
      const al = Math.max(0, Math.min(1, m.life));
      const g = ctx.createLinearGradient(m.x, m.y, tx, ty);
      g.addColorStop(0, `rgba(255,255,255,${0.9 * al})`);
      g.addColorStop(0.4, `rgba(180,210,255,${0.35 * al})`);
      g.addColorStop(1, 'rgba(180,210,255,0)');
      ctx.strokeStyle = g; ctx.lineWidth = 2 * dpr; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(m.x, m.y); ctx.lineTo(tx, ty); ctx.stroke();
      ctx.beginPath(); ctx.arc(m.x, m.y, 1.6 * dpr, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,255,255,${al})`; ctx.fill();
      if (m.life <= 0 || m.x < -m.len || m.x > w + m.len || m.y > h + m.len) shooting.splice(i, 1);
    }
    requestAnimationFrame(frame);
  }

  addEventListener('resize', resize);
  resize();
  frame();
})();
