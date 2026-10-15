// A temporary, bounded canvas; it never owns an always-running background loop.
export function launchIslandFireworks(host: HTMLElement): () => void {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || document.hidden) return () => {};
  const canvas = document.createElement('canvas');
  canvas.className = 'island-fireworks'; canvas.setAttribute('aria-hidden', 'true');
  const ctx = canvas.getContext('2d');
  if (!ctx) return () => {};
  host.append(canvas);
  let width = 0, height = 0, frame = 0, stopped = false;
  const resize = () => {
    width = innerWidth; height = innerHeight;
    const scale = Math.min(1, 1600 / width, 1000 / height);
    canvas.width = Math.max(1, Math.floor(width * scale));
    canvas.height = Math.max(1, Math.floor(height * scale));
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
  };
  const stop = () => {
    if (stopped) return;
    stopped = true; cancelAnimationFrame(frame);
    removeEventListener('resize', resize); document.removeEventListener('visibilitychange', visibility);
    canvas.remove(); canvas.width = canvas.height = 0;
  };
  const visibility = () => { if (document.hidden) stop(); };
  const palette = ['#ffe19a', '#ffd2a1', '#9edee8', '#d8e5a8', '#ffc6ce', '#fff1c1'];
  const bursts = [
    { x: .14, y: .23, delay: .3 }, { x: .86, y: .29, delay: .8 },
    { x: .25, y: .12, delay: 1.4 }, { x: .79, y: .69, delay: 2 },
    { x: .10, y: .60, delay: 2.7 }, { x: .90, y: .15, delay: 3.3 },
    { x: .20, y: .38, delay: 4 }, { x: .80, y: .40, delay: 4.7 },
    { x: .10, y: .75, delay: 5.4 }, { x: .89, y: .72, delay: 6 },
    { x: .17, y: .19, delay: 6.6 }, { x: .83, y: .19, delay: 6.85 },
    { x: .36, y: .08, delay: 7.1 }, { x: .66, y: .09, delay: 7.2 },
    { x: .50, y: .05, delay: 7.3 },
  ];
  const count = innerWidth < 600 ? 30 : 46;
  const particles = bursts.flatMap((burst, index) => Array.from({ length: count }, (_, i) => {
    const inner = i % 3 === 0;
    return { burst, angle: i / count * Math.PI * 2 + index * .23, speed: inner ? 65 + Math.random() * 45 : 135 + Math.random() * 95,
      life: 1.65 + Math.random() * .6, color: palette[(index + (inner ? 2 : 0)) % palette.length], twinkle: i % 7 === 0, inner };
  }));
  const start = performance.now();
  const draw = (now: number) => {
    if (stopped) return;
    if (!canvas.isConnected || now - start >= 9600) { stop(); return; }
    const elapsed = (now - start) / 1000;
    ctx.clearRect(0, 0, width, height);
    ctx.lineCap = 'round'; ctx.lineWidth = 2;
    for (const burst of bursts) {
      const remaining = burst.delay - elapsed;
      if (remaining <= 0 || remaining > .6) continue;
      const x = width * burst.x, y = height * burst.y + (remaining / .6) ** 1.4 * height * .34;
      const tail = ctx.createLinearGradient(x, y, x, y + 48);
      tail.addColorStop(0, '#ffe7a3'); tail.addColorStop(1, '#ffe7a300');
      ctx.globalAlpha = .9; ctx.strokeStyle = tail; ctx.beginPath();
      ctx.moveTo(x, y + 48); ctx.lineTo(x, y); ctx.stroke();
    }
    for (const particle of particles) {
      const age = elapsed - particle.burst.delay;
      if (age < 0 || age >= particle.life) continue;
      const position = (time: number) => {
        const distance = particle.speed * (1 - Math.exp(-.8 * time)) / .8;
        return { x: width * particle.burst.x + Math.cos(particle.angle) * distance,
          y: height * particle.burst.y + Math.sin(particle.angle) * distance + 24 * time * time };
      };
      const p = position(age), previous = position(Math.max(0, age - .065));
      ctx.globalAlpha = Math.pow(1 - age / particle.life, .8) * (particle.twinkle ? .65 + .35 * Math.sin(age * 18) ** 2 : 1);
      ctx.shadowColor = particle.color; ctx.shadowBlur = particle.inner ? 6 : 3;
      ctx.lineWidth = particle.inner ? 1.5 : 2.1;
      ctx.strokeStyle = particle.color; ctx.beginPath(); ctx.moveTo(previous.x, previous.y); ctx.lineTo(p.x, p.y); ctx.stroke();
      ctx.fillStyle = particle.color; ctx.beginPath(); ctx.arc(p.x, p.y, particle.inner ? 1.8 : 2.2, 0, Math.PI * 2); ctx.fill();
      if (particle.twinkle && age > .4) {
        ctx.lineWidth = 1; ctx.beginPath();
        ctx.moveTo(p.x - 3.5, p.y); ctx.lineTo(p.x + 3.5, p.y);
        ctx.moveTo(p.x, p.y - 3.5); ctx.lineTo(p.x, p.y + 3.5); ctx.stroke();
      }
    }
    ctx.shadowBlur = 0;
    frame = requestAnimationFrame(draw);
  };
  resize(); addEventListener('resize', resize); document.addEventListener('visibilitychange', visibility);
  frame = requestAnimationFrame(draw);
  return stop;
}
