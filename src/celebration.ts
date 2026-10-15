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
  const palette = ['#b88b34', '#cf9865', '#58a9ac', '#91a952', '#d58373', '#e4bd5d'];
  const bursts = [
    { x: .16, y: .25, delay: .25 }, { x: .83, y: .27, delay: .65 },
    { x: .28, y: .57, delay: 1.15 }, { x: .70, y: .15, delay: 1.55 },
    { x: .10, y: .58, delay: 2.05 }, { x: .88, y: .56, delay: 2.45 },
  ];
  const particles = bursts.flatMap((burst, index) => Array.from({ length: 30 }, (_, i) => {
    const angle = i / 30 * Math.PI * 2;
    return { burst, angle, speed: 65 + Math.random() * 75, life: 1.15 + Math.random() * .45, color: palette[(index + i % 3) % palette.length] };
  }));
  const start = performance.now();
  const draw = (now: number) => {
    if (stopped) return;
    if (!canvas.isConnected || now - start >= 4400) { stop(); return; }
    const elapsed = (now - start) / 1000;
    ctx.clearRect(0, 0, width, height);
    ctx.lineCap = 'round'; ctx.lineWidth = 2;
    for (const burst of bursts) {
      const remaining = burst.delay - elapsed;
      if (remaining <= 0 || remaining > .28) continue;
      const y = height * burst.y + remaining / .28 * height * .24;
      ctx.globalAlpha = .7;
      ctx.strokeStyle = '#caa04c'; ctx.beginPath();
      ctx.moveTo(width * burst.x, y + 20); ctx.lineTo(width * burst.x, y); ctx.stroke();
    }
    for (const particle of particles) {
      const age = elapsed - particle.burst.delay;
      if (age < 0 || age >= particle.life) continue;
      const position = (time: number) => ({
        x: width * particle.burst.x + Math.cos(particle.angle) * particle.speed * time,
        y: height * particle.burst.y + Math.sin(particle.angle) * particle.speed * time + 37 * time * time,
      });
      const p = position(age), previous = position(Math.max(0, age - .055));
      ctx.globalAlpha = Math.pow(1 - age / particle.life, 1.1);
      ctx.strokeStyle = particle.color; ctx.beginPath(); ctx.moveTo(previous.x, previous.y); ctx.lineTo(p.x, p.y); ctx.stroke();
      ctx.fillStyle = particle.color; ctx.beginPath(); ctx.arc(p.x, p.y, 1.6, 0, Math.PI * 2); ctx.fill();
    }
    frame = requestAnimationFrame(draw);
  };
  resize(); addEventListener('resize', resize); document.addEventListener('visibilitychange', visibility);
  frame = requestAnimationFrame(draw);
  return stop;
}
