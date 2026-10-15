import Phaser from 'phaser';
import { paceFactor } from './session.ts';
import type { Pace } from './types.ts';

interface Pad { image: Phaser.GameObjects.Image; x: number; y: number; velocity: number }
export interface GardenCallbacks {
  tick(delta: number): void;
  boundary(): void;
  ready(): void;
  target(position: { x: number; y: number; moving: boolean; visible: boolean }): void;
}
export class GardenScene extends Phaser.Scene {
  private pads: Pad[] = [];
  private frog!: Phaser.GameObjects.Image;
  private glow!: Phaser.GameObjects.Ellipse;
  private ripples!: Phaser.GameObjects.Graphics;
  private animationQueue = 0;
  private jumping = false;
  private falling = false;
  private phase = 0;
  private pace: Pace = 'normal';
  private running = false;
  private settledCallback?: () => void;
  private reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  constructor(private callbacks: GardenCallbacks) { super({ key: 'garden' }); }
  preload() {
    this.load.image('pond', 'assets/garden-pond.webp');
    this.load.image('frog', 'assets/frog-dumpling.webp');
    this.load.svg('lily', 'assets/lily.svg', { width: 420, height: 210 });
  }
  create() {
    this.drawGarden();
    this.glow = this.add.ellipse(500, 536, 376, 132, 0xe6edb3, 0.12).setStrokeStyle(1.5, 0xf5edca, 0.5);
    this.frog = this.add.image(500, 614, 'frog').setDisplaySize(112, 112).setOrigin(0.5, 0.88).setDepth(100);
    this.resetPads();
    this.callbacks.ready();
  }
  private drawGarden() {
    // One fixed logical coordinate system. Phaser scales the entire scene together.
    this.add.image(500, 360, 'pond').setDisplaySize(1000, 720);
    this.ripples = this.add.graphics();
    for (let i = 0; i < 20; i++) {
      this.ripples.lineStyle(1, 0xf5f5df, 0.1 + (i % 3) * 0.02);
      this.ripples.strokeEllipse(195 + (i * 107) % 600, 160 + (i * 61) % 530, 35 + i % 5 * 13, 5);
    }
    if (!this.reduceMotion) this.tweens.add({ targets: this.ripples, x: 10, alpha: 0.45, duration: 5000, yoyo: true, repeat: -1 });
  }
  private makePad(y: number, index: number): Pad {
    const x = 500 + Math.sin(index * 1.7 + 0.8) * 210;
    const velocity = (index % 2 ? -1 : 1) * (20 + index % 3 * 5);
    const image = this.add.image(x, y, 'lily').setDisplaySize(173, 87).setDepth(y / 10);
    return { image, x, y, velocity };
  }
  private resetPads() {
    this.pads.forEach(p => p.image.destroy()); this.pads = [];
    for (let i = 0; i < 5; i++) this.pads.push(this.makePad(645 - i * 125, i + this.phase));
    this.pads[0].x = 500;
    this.frog.setPosition(500, 622).setAlpha(1).setDisplaySize(112, 112).setRotation(0);
    this.layoutTarget();
  }
  private layoutTarget() {
    const target = this.pads[1];
    if (!target) return;
    // The active leaf is a readable surface for the word itself, without a UI card.
    for (const pad of this.pads) {
      const active = pad === target;
      const width = active ? 420 : 173;
      if (pad.image.displayWidth !== width) pad.image.setDisplaySize(width, active ? 220 : 87);
    }
    this.glow.setPosition(target.x, target.y + 5);
    this.glow.setVisible(!this.jumping && !this.falling);
    this.callbacks.target({ x: target.x, y: target.image.y - 4, moving: this.jumping, visible: !this.falling });
  }
  setPace(pace: Pace) { this.pace = pace; }
  start() { this.running = true; }
  stop() { this.running = false; }
  get recovering() { return this.falling; }
  advance() { this.animationQueue++; this.consumeJump(); }
  whenSettled(callback: () => void) {
    if (!this.jumping && !this.animationQueue) callback();
    else this.settledCallback = callback;
  }
  private consumeJump() {
    if (this.jumping || this.falling || !this.animationQueue) return;
    this.animationQueue--; this.jumping = true;
    this.glow.setVisible(false);
    const target = this.pads[1]; const start = { x: this.frog.x, y: this.frog.y };
    const motion = { progress: 0 };
    const duration = this.reduceMotion ? 100 : 230;
    this.tweens.add({ targets: motion, progress: 1, duration,
      onUpdate: () => {
        const t = motion.progress;
        this.frog.setPosition(Phaser.Math.Linear(start.x, target.x, t), Phaser.Math.Linear(start.y, target.y - 23, t) - Math.sin(t * Math.PI) * (this.reduceMotion ? 0 : 70));
      },
      onComplete: () => {
        const shifting = this.pads.map(p => p.image);
        this.tweens.add({ targets: [...shifting, this.frog], y: '+=125', duration: this.reduceMotion ? 80 : 180, ease: 'Sine.easeInOut',
          onComplete: () => {
            const old = this.pads.shift()!; old.image.destroy();
            this.pads.forEach(p => { p.y += 125; });
            this.phase++; this.pads.push(this.makePad(145, this.phase + 4));
            this.jumping = false; this.layoutTarget(); this.consumeJump();
            if (!this.jumping && !this.animationQueue && this.settledCallback) {
              const callback = this.settledCallback; this.settledCallback = undefined; callback();
            }
          },
        });
      },
    });
  }
  fall(callback: () => void) {
    if (this.falling) return;
    this.falling = true; this.running = false; this.animationQueue = 0;
    this.settledCallback = undefined;
    // Remove only gameplay tweens; background ripples continue.
    this.tweens.getTweens().forEach(tween => { if (!tween.targets.some(t => t === this.ripples)) tween.stop(); });
    this.jumping = false;
    const x = this.frog.x, y = this.frog.y + 12;
    const ring = this.add.ellipse(x, y, 20, 8).setStrokeStyle(2, 0xf1f4d8, 0.9).setDepth(101);
    this.tweens.add({ targets: ring, scaleX: 8, scaleY: 5, alpha: 0, duration: 650, onComplete: () => ring.destroy() });
    this.tweens.add({ targets: this.frog, y: y + 28, alpha: 0, angle: 12, duration: 230 });
    this.time.delayedCall(700, () => { this.falling = false; this.resetPads(); callback(); });
  }
  update(_time: number, rawDelta: number) {
    if (!this.running || this.falling) return;
    const delta = Math.min(rawDelta, 80) / 1000;
    for (const pad of this.pads) {
      pad.x += pad.velocity * delta * paceFactor[this.pace];
      if (pad !== this.pads[0] && (pad.x < 195 || pad.x > 805)) pad.velocity *= -1;
      pad.image.x = pad.x;
    }
    if (!this.jumping) {
      this.frog.setPosition(this.pads[0].x, this.pads[0].y - 23);
      if (this.pads[0].x < 150 || this.pads[0].x > 850) { this.callbacks.boundary(); return; }
    }
    this.layoutTarget();
    this.callbacks.tick(delta);
  }
}

export function createGarden(parent: HTMLElement, callbacks: GardenCallbacks) {
  const scene = new GardenScene(callbacks);
  const game = new Phaser.Game({ type: Phaser.AUTO, parent, width: 1000, height: 720, transparent: true, antialias: true,
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH }, scene,
    audio: { noAudio: true }, render: { pixelArt: false, roundPixels: false }, banner: false });
  return { game, scene };
}
