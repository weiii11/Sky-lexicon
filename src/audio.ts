import { AmbientMusic, type MusicScene } from './music.ts';

export class GameAudio {
  enabled = true;
  musicEnabled = true;
  private context?: AudioContext;
  private music?: AmbientMusic;
  private scene: MusicScene = 'map';
  private visible = true;
  unlock() {
    if ((!this.enabled && !this.musicEnabled) || !this.visible) return;
    try {
      if (!this.context) {
        this.context = new AudioContext();
        this.music = new AmbientMusic(this.context); this.music.setScene(this.scene);
        this.context.addEventListener('statechange', () => this.syncMusic());
      }
      if (this.context.state === 'running') this.syncMusic();
      else void this.context.resume().then(() => this.syncMusic()).catch(() => {});
    } catch { /* Sound is optional. */ }
  }
  setScene(scene: MusicScene) { this.scene = scene; this.music?.setScene(scene); }
  setMusic(enabled: boolean) {
    this.musicEnabled = enabled;
    if (enabled) this.unlock(); else this.music?.stop();
  }
  setVisible(visible: boolean) {
    this.visible = visible;
    if (!visible) { this.music?.stop(); void this.context?.suspend().catch(() => {}); }
    else if (this.context) this.unlock();
  }
  private syncMusic() {
    if (this.musicEnabled && this.visible && this.context?.state === 'running') this.music?.start();
    else this.music?.stop();
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
