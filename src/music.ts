export type MusicScene = 'map' | 'game';

// An original eight-bar miniature, played locally with soft keys and bell-like arpeggios.
// Nothing is downloaded, and there is only one short look-ahead scheduler.
const chords = [
  [48, 55, 59, 64], [45, 52, 55, 60], [41, 48, 52, 57], [43, 50, 55, 62],
  [48, 55, 60, 64], [40, 47, 55, 62], [41, 48, 57, 60], [43, 50, 59, 62],
];
const melody = [
  [76, 0, 79, 74], [72, 0, 71, 69], [69, 72, 0, 76], [74, 0, 71, 67],
  [72, 76, 79, 0], [74, 71, 0, 67], [69, 0, 72, 74], [71, 74, 72, 0],
];
const frequency = (note: number) => 440 * 2 ** ((note - 69) / 12);

export class AmbientMusic {
  private master: GainNode;
  private tone: BiquadFilterNode;
  private voices = new Set<OscillatorNode>();
  private timer?: ReturnType<typeof setInterval>;
  private step = 0;
  private nextTime = 0;
  private scene: MusicScene = 'map';

  constructor(private context: AudioContext) {
    this.master = context.createGain(); this.master.gain.value = 0;
    this.master.connect(context.destination);
    this.tone = context.createBiquadFilter();
    this.tone.type = 'lowpass'; this.tone.frequency.value = 2300; this.tone.Q.value = .4;
    this.tone.connect(this.master);
    const echo = context.createDelay(1), feedback = context.createGain(), wet = context.createGain();
    echo.delayTime.value = .36; feedback.gain.value = .18; wet.gain.value = .22;
    this.tone.connect(echo); echo.connect(feedback); feedback.connect(echo);
    echo.connect(wet); wet.connect(this.master);
  }

  setScene(scene: MusicScene) {
    this.scene = scene;
    if (this.timer) this.fadeTo(scene === 'map' ? .6 : .5);
  }

  start() {
    if (this.timer || this.context.state !== 'running') return;
    this.nextTime = this.context.currentTime + .06;
    this.fadeTo(this.scene === 'map' ? .6 : .5);
    this.schedule();
    this.timer = setInterval(() => this.schedule(), 140);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    this.fadeTo(0);
    for (const voice of this.voices) voice.stop(this.context.currentTime + .18);
    this.voices.clear();
  }

  private fadeTo(value: number) {
    const now = this.context.currentTime;
    const current = this.master.gain.value;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(current, now);
    this.master.gain.linearRampToValueAtTime(value, now + .18);
  }

  private note(midi: number, time: number, duration: number, volume: number, type: OscillatorType = 'sine') {
    const oscillator = this.context.createOscillator(), envelope = this.context.createGain();
    oscillator.type = type; oscillator.frequency.value = frequency(midi);
    envelope.gain.setValueAtTime(0, time);
    envelope.gain.linearRampToValueAtTime(volume, time + (type === 'sine' ? .07 : .018));
    envelope.gain.exponentialRampToValueAtTime(.0001, time + duration);
    oscillator.connect(envelope); envelope.connect(this.tone);
    this.voices.add(oscillator);
    oscillator.onended = () => { this.voices.delete(oscillator); oscillator.disconnect(); envelope.disconnect(); };
    oscillator.start(time); oscillator.stop(time + duration + .03);
  }

  private schedule() {
    if (this.context.state !== 'running') return;
    const now = this.context.currentTime;
    if (this.nextTime < now - .4) this.nextTime = now + .04;
    while (this.nextTime < now + .4) {
      const beat = 60 / (this.scene === 'map' ? 68 : 76);
      const bar = Math.floor(this.step / 8) % chords.length, slot = this.step % 8;
      const chord = chords[bar];
      if (slot === 0) {
        chord.forEach(pitch => this.note(pitch, this.nextTime, beat * 3.8, .012));
        this.note(chord[0] - 12, this.nextTime, beat * 2.8, .022);
      }
      const arpeggios = this.scene === 'map' ? [0, 3, 6] : [0, 2, 4, 6];
      if (arpeggios.includes(slot)) this.note(chord[Math.floor(slot / 2) % 4] + 12, this.nextTime, beat * 1.6, .025, 'triangle');
      if (slot % 2 === 0 && melody[bar][slot / 2]) this.note(melody[bar][slot / 2], this.nextTime + .025, beat * 1.8, .038, 'triangle');
      this.nextTime += beat / 2; this.step++;
    }
  }
}
