import type { GameSettings } from '../core/Settings';

/**
 * Звук без файлов: все эффекты синтезируются WebAudio (шум, тоны, огибающие).
 * Шины: эффекты, музыка, окружение → общая громкость. Контекст создаётся после первого жеста.
 */

export type Sfx =
  | 'step_wood'
  | 'step_ground'
  | 'pickup'
  | 'drop'
  | 'place'
  | 'boxOpen'
  | 'trash'
  | 'click'
  | 'scan'
  | 'error'
  | 'drawer'
  | 'coin'
  | 'card'
  | 'bell'
  | 'phone'
  | 'levelUp'
  | 'cash'
  | 'board'
  | 'boardCrack'
  | 'broom'
  | 'notify'
  | 'success'
  | 'web'
  | 'pop'
  | 'door';

interface PlayOpts {
  vol?: number;
  rate?: number;
}

/** Минорная пентатоника от ля: A C D E G — ложится на все аккорды C–Am–F–G. */
const PENTA = [0, 3, 5, 7, 10];
const CHORDS = [
  [3, 7, 10],
  [0, 3, 7],
  [-4, 0, 3],
  [-2, 2, 5],
];

export class AudioSystem {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfx!: GainNode;
  private music!: GainNode;
  private amb!: GainNode;
  private ambFilter!: BiquadFilterNode;
  private noise!: AudioBuffer;
  private settings: GameSettings['audio'];
  private windGain: GainNode | null = null;
  private loops = new Map<string, { stop: () => void }>();
  private nextBird = 2;
  private nextCricket = 0;
  private musicT = 0;
  private musicStep = 0;
  private lastPlay = new Map<Sfx, number>();
  /** 0 — в помещении, 1 — на улице. */
  private outdoor = 1;
  private night = 0;
  musicOn = true;

  constructor(settings: GameSettings['audio']) {
    this.settings = { ...settings };
    const unlock = () => this.unlock();
    window.addEventListener('pointerdown', unlock, { capture: true });
    window.addEventListener('keydown', unlock, { capture: true });
  }

  get ready(): boolean {
    return !!this.ctx && this.ctx.state === 'running';
  }

  unlock(): void {
    try {
      if (!this.ctx) {
        const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (!Ctx) return;
        this.ctx = new Ctx();
        this.build();
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume();
    } catch {
      /* звук недоступен — игра работает без него */
    }
  }

  private build(): void {
    const c = this.ctx!;
    this.master = c.createGain();
    this.sfx = c.createGain();
    this.music = c.createGain();
    this.amb = c.createGain();
    this.ambFilter = c.createBiquadFilter();
    this.ambFilter.type = 'lowpass';
    this.ambFilter.frequency.value = 18000;
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 3;
    this.sfx.connect(this.master);
    this.music.connect(this.master);
    this.amb.connect(this.ambFilter).connect(this.master);
    this.master.connect(comp).connect(c.destination);
    const len = c.sampleRate * 2;
    this.noise = c.createBuffer(1, len, c.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.applySettings(this.settings);
    this.startWind();
  }

  applySettings(a: GameSettings['audio']): void {
    this.settings = { ...a };
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(a.master, t, 0.05);
    this.sfx.gain.setTargetAtTime(a.effects, t, 0.05);
    this.music.gain.setTargetAtTime(a.music * 0.55, t, 0.05);
    this.amb.gain.setTargetAtTime(a.effects * 0.8, t, 0.05);
  }

  // ───────── Примитивы ─────────

  private env(g: GainNode, t: number, peak: number, attack: number, decay: number): void {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  private tone(freq: number, dur: number, type: OscillatorType, vol: number, opts: { t?: number; slide?: number; attack?: number; out?: AudioNode; detune?: number } = {}): void {
    const c = this.ctx!;
    const t = opts.t ?? c.currentTime;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (opts.slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, opts.slide), t + dur);
    if (opts.detune) o.detune.value = opts.detune;
    const g = c.createGain();
    this.env(g, t, vol, opts.attack ?? 0.005, dur);
    o.connect(g).connect(opts.out ?? this.sfx);
    o.start(t);
    o.stop(t + dur + (opts.attack ?? 0.005) + 0.05);
  }

  private noiseBurst(dur: number, filter: BiquadFilterType, freq: number, vol: number, opts: { t?: number; q?: number; sweep?: number; attack?: number; out?: AudioNode } = {}): void {
    const c = this.ctx!;
    const t = opts.t ?? c.currentTime;
    const s = c.createBufferSource();
    s.buffer = this.noise;
    s.loop = true;
    const f = c.createBiquadFilter();
    f.type = filter;
    f.frequency.setValueAtTime(freq, t);
    if (opts.sweep) f.frequency.exponentialRampToValueAtTime(opts.sweep, t + dur);
    f.Q.value = opts.q ?? 0.8;
    const g = c.createGain();
    this.env(g, t, vol, opts.attack ?? 0.004, dur);
    s.connect(f).connect(g).connect(opts.out ?? this.sfx);
    s.start(t, Math.random() * 1.5);
    s.stop(t + dur + (opts.attack ?? 0.004) + 0.05);
  }

  // ───────── Эффекты ─────────

  play(name: Sfx, o: PlayOpts = {}): void {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    // Защита от «пулемёта» одинаковых звуков.
    const last = this.lastPlay.get(name) ?? -1;
    if (now - last < 0.03) return;
    this.lastPlay.set(name, now);
    const v = o.vol ?? 1;
    const r = o.rate ?? 1 + (Math.random() - 0.5) * 0.08;
    switch (name) {
      case 'step_wood':
        this.tone(115 * r, 0.09, 'sine', 0.22 * v, { slide: 70 * r });
        this.noiseBurst(0.05, 'lowpass', 900 * r, 0.12 * v);
        break;
      case 'step_ground':
        this.noiseBurst(0.07, 'bandpass', 1300 * r, 0.16 * v, { q: 0.6 });
        this.noiseBurst(0.05, 'lowpass', 500, 0.08 * v);
        break;
      case 'pickup':
        this.noiseBurst(0.09, 'bandpass', 1500 * r, 0.22 * v, { q: 1.2 });
        this.tone(210 * r, 0.07, 'sine', 0.15 * v, { slide: 150 });
        break;
      case 'drop':
        this.tone(95 * r, 0.16, 'sine', 0.35 * v, { slide: 48 });
        this.noiseBurst(0.1, 'lowpass', 420, 0.22 * v);
        break;
      case 'place':
        this.tone(640 * r, 0.045, 'sine', 0.1 * v, { slide: 420 });
        this.noiseBurst(0.03, 'highpass', 2800, 0.06 * v);
        break;
      case 'boxOpen':
        this.noiseBurst(0.28, 'bandpass', 700, 0.28 * v, { sweep: 3200, q: 2.2 });
        this.noiseBurst(0.08, 'lowpass', 600, 0.15 * v, { t: this.ctx.currentTime + 0.26 });
        break;
      case 'trash':
        for (let i = 0; i < 3; i++) this.noiseBurst(0.12, 'bandpass', 900 + i * 500, 0.22 * v, { t: now + i * 0.05, q: 3 });
        this.tone(185, 0.35, 'square', 0.05 * v, { slide: 120 });
        this.tone(277, 0.3, 'square', 0.035 * v, { slide: 180 });
        break;
      case 'click':
        this.tone(1250, 0.03, 'sine', 0.09 * v);
        break;
      case 'scan':
        this.tone(1860, 0.1, 'square', 0.08 * v);
        break;
      case 'error':
        this.tone(150, 0.22, 'sawtooth', 0.08 * v, { slide: 120 });
        break;
      case 'drawer':
        this.noiseBurst(0.22, 'lowpass', 1300, 0.22 * v, { sweep: 500 });
        this.tone(2640, 0.55, 'sine', 0.08 * v, { t: now + 0.18 });
        this.tone(3960, 0.45, 'sine', 0.05 * v, { t: now + 0.18 });
        break;
      case 'coin':
        this.tone(2050 * r, 0.16, 'sine', 0.1 * v);
        this.tone(3080 * r, 0.12, 'sine', 0.06 * v, { t: now + 0.01 });
        break;
      case 'card':
        this.tone(1320, 0.08, 'sine', 0.12 * v);
        this.tone(1760, 0.12, 'sine', 0.12 * v, { t: now + 0.11 });
        break;
      case 'bell':
        for (const [f, a] of [
          [1320, 0.12],
          [1985, 0.07],
          [2640, 0.05],
        ] as const) {
          this.tone(f, 0.9, 'sine', a * v);
          this.tone(f * 1.003, 0.8, 'sine', a * 0.7 * v, { t: now + 0.16 });
        }
        break;
      case 'phone':
        for (let i = 0; i < 10; i++) {
          this.tone(440, 0.05, 'sine', 0.1 * v, { t: now + i * 0.1 });
          this.tone(480, 0.05, 'sine', 0.1 * v, { t: now + i * 0.1 + 0.05 });
        }
        break;
      case 'levelUp':
        [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.22, 'triangle', 0.14 * v, { t: now + i * 0.1 }));
        this.tone(1568, 0.6, 'sine', 0.06 * v, { t: now + 0.4 });
        break;
      case 'cash':
        for (let i = 0; i < 3; i++) this.noiseBurst(0.06, 'highpass', 2400 + i * 600, 0.08 * v, { t: now + i * 0.045 });
        break;
      case 'board':
        this.tone(95 * r, 0.35, 'sawtooth', 0.05 * v, { slide: 62 });
        this.noiseBurst(0.3, 'bandpass', 420, 0.1 * v, { q: 4, sweep: 300 });
        break;
      case 'boardCrack':
        this.noiseBurst(0.12, 'bandpass', 650, 0.4 * v, { q: 1.5 });
        this.tone(80, 0.25, 'sine', 0.3 * v, { slide: 40, t: now + 0.05 });
        break;
      case 'broom':
        this.noiseBurst(0.2, 'bandpass', 2600 * r, 0.12 * v, { q: 0.7, attack: 0.05, sweep: 1700 });
        break;
      case 'notify':
        this.tone(880, 0.28, 'sine', 0.09 * v);
        this.tone(1320, 0.3, 'sine', 0.05 * v, { t: now + 0.07 });
        break;
      case 'success':
        [523, 659, 784].forEach((f) => this.tone(f, 0.55, 'triangle', 0.08 * v, { attack: 0.01 }));
        break;
      case 'web':
        this.noiseBurst(0.22, 'highpass', 3800, 0.08 * v, { attack: 0.03 });
        break;
      case 'pop':
        this.tone(420, 0.07, 'sine', 0.12 * v, { slide: 820 });
        break;
      case 'door':
        this.noiseBurst(0.25, 'lowpass', 500, 0.08 * v, { sweep: 260 });
        break;
    }
  }

  /** Повторяющийся звук (звонок телефона, мотор автобуса). */
  startLoop(name: 'phone' | 'engine'): void {
    if (!this.ctx || this.loops.has(name)) return;
    const c = this.ctx;
    if (name === 'phone') {
      this.play('phone');
      const id = window.setInterval(() => this.play('phone'), 2200);
      this.loops.set(name, { stop: () => window.clearInterval(id) });
    } else {
      const o = c.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = 48;
      const lfo = c.createOscillator();
      lfo.frequency.value = 7;
      const lg = c.createGain();
      lg.gain.value = 6;
      lfo.connect(lg).connect(o.frequency);
      const f = c.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 260;
      const g = c.createGain();
      g.gain.value = 0;
      g.gain.setTargetAtTime(0.16, c.currentTime, 0.3);
      o.connect(f).connect(g).connect(this.sfx);
      o.start();
      lfo.start();
      this.loops.set(name, {
        stop: () => {
          g.gain.setTargetAtTime(0, c.currentTime, 0.4);
          setTimeout(() => {
            o.stop();
            lfo.stop();
          }, 1500);
        },
      });
    }
  }

  stopLoop(name: string): void {
    this.loops.get(name)?.stop();
    this.loops.delete(name);
  }

  // ───────── Окружение и музыка ─────────

  private startWind(): void {
    const c = this.ctx!;
    const s = c.createBufferSource();
    s.buffer = this.noise;
    s.loop = true;
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 380;
    const g = c.createGain();
    g.gain.value = 0.025;
    const lfo = c.createOscillator();
    lfo.frequency.value = 0.09;
    const lg = c.createGain();
    lg.gain.value = 0.018;
    lfo.connect(lg).connect(g.gain);
    s.connect(f).connect(g).connect(this.amb);
    s.start();
    lfo.start();
    this.windGain = g;
  }

  /** Состояние окружения: на улице ли игрок, ночь ли. */
  setEnvironment(outdoor: number, night: number): void {
    this.outdoor = outdoor;
    this.night = night;
  }

  update(dt: number, active: boolean): void {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const c = this.ctx;
    const t = c.currentTime;
    this.ambFilter.frequency.setTargetAtTime(this.outdoor > 0.5 ? 16000 : 900, t, 0.3);
    if (this.windGain) this.windGain.gain.setTargetAtTime(0.012 + 0.02 * this.outdoor, t, 0.5);
    if (!active) return;
    // Птицы днём.
    this.nextBird -= dt;
    if (this.nextBird <= 0) {
      this.nextBird = 1.5 + Math.random() * 4;
      if (this.night < 0.4) this.birdCall(t);
    }
    // Сверчки ночью.
    this.nextCricket -= dt;
    if (this.nextCricket <= 0) {
      this.nextCricket = 0.6 + Math.random() * 1.2;
      if (this.night > 0.5) this.cricket(t);
    }
    // Музыка: мягкие аккорды и перебор по пентатонике.
    if (this.musicOn && this.settings.music > 0.01) {
      this.musicT -= dt;
      while (this.musicT <= 0) {
        this.musicT += 0.55;
        this.musicBeat(t + 0.05);
      }
    }
  }

  private birdCall(t: number): void {
    const n = 2 + Math.floor(Math.random() * 4);
    const base = 2600 + Math.random() * 1600;
    for (let i = 0; i < n; i++) {
      const st = t + i * (0.09 + Math.random() * 0.06);
      this.tone(base * (1 + Math.random() * 0.15), 0.07, 'sine', 0.025, { t: st, slide: base * (1.3 + Math.random() * 0.4), out: this.amb });
    }
  }

  private cricket(t: number): void {
    for (let i = 0; i < 4; i++) this.tone(4300, 0.025, 'sine', 0.012, { t: t + i * 0.045, out: this.amb });
  }

  private musicBeat(t: number): void {
    const step = this.musicStep++;
    const bar = Math.floor(step / 8) % CHORDS.length;
    const chord = CHORDS[bar]!;
    const root = 57; // A3
    const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);
    if (step % 8 === 0) {
      for (const n of chord) this.tone(midi(root + n - 12), 4.2, 'triangle', 0.018, { t, attack: 0.6, out: this.music });
    }
    if (Math.random() < 0.55) {
      const deg = PENTA[Math.floor(Math.random() * PENTA.length)]!;
      const oct = Math.random() < 0.3 ? 12 : 0;
      this.tone(midi(root + 12 + deg + oct), 0.9, 'triangle', 0.028, { t, attack: 0.008, out: this.music });
    }
  }
}
