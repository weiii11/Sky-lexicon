export class GameAudio {
  enabled = true;
  private context?: AudioContext;
  unlock() {
    if (!this.enabled) return;
    try { this.context ??= new AudioContext(); void this.context.resume().catch(() => {}); } catch { /* Sound is optional. */ }
  }
  play(type: 'correct' | 'wrong' | 'win') {
    if (!this.enabled || !this.context || this.context.state !== 'running') return;
    const notes = type === 'correct' ? [523, 659] : type === 'win' ? [523, 659, 784, 1047] : [220, 165];
    const ctx = this.context;
    notes.forEach((frequency, i) => {
      const start = ctx.currentTime + i * 0.08;
      const oscillator = ctx.createOscillator(), gain = ctx.createGain();
      oscillator.type = 'sine'; oscillator.frequency.setValueAtTime(frequency, start);
      gain.gain.setValueAtTime(0, start); gain.gain.linearRampToValueAtTime(0.045, start + 0.015); gain.gain.exponentialRampToValueAtTime(0.001, start + 0.22);
      oscillator.connect(gain); gain.connect(ctx.destination); oscillator.start(start); oscillator.stop(start + 0.24);
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
    });
  }
}
