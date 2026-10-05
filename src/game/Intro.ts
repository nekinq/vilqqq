import * as THREE from 'three';
import type { Game } from './Game';
import { BUS_ROUTE_IN, BUS_ROUTE_OUT, BUS_STOP_POINT, PLAYER_ARRIVAL } from '../world/layout';
import { groundHeight } from '../world/Ground';
import { h } from '../ui/dom';
import { CharacterRig } from '../customers/CharacterRig';

/** Кривая маршрута по точкам на земле. */
function route(pts: readonly (readonly [number, number])[]): THREE.CatmullRomCurve3 {
  return new THREE.CatmullRomCurve3(
    pts.map(([x, z]) => new THREE.Vector3(x, groundHeight(x, z), z)),
    false,
    'centripetal',
  );
}

const T_ARRIVE = 24;
const T_FADE = 29;
const T_FP = 29.6;
const T_END = 36;

/**
 * Интро (≈36 с, можно пропустить): ретро-автобус едет к Дубравке, пролёт над площадью,
 * остановка, переход в вид от первого лица, автобус уезжает. Потом — звонок бабушки (в игре).
 */
export class Intro {
  t = 0;
  private bus: THREE.Object3D;
  private driver: { obj: THREE.Object3D; rig: CharacterRig } | null = null;
  private inCurve: THREE.CatmullRomCurve3;
  private outCurve: THREE.CatmullRomCurve3;
  private inLen: number;
  private outLen: number;
  private wheels: THREE.Object3D[] = [];
  private skipBtn: HTMLElement;
  private fpDone = false;
  private faded = false;
  private titled = false;
  private doorSound = false;
  private outS = 0;
  private outV = 0;
  done = false;

  constructor(
    private readonly game: Game,
    private readonly onDone: (skipped: boolean) => void,
  ) {
    const pts = [[-3, 105] as const, ...BUS_ROUTE_IN, BUS_STOP_POINT];
    this.inCurve = route(pts);
    this.outCurve = route(BUS_ROUTE_OUT);
    this.inLen = this.inCurve.getLength();
    this.outLen = this.outCurve.getLength();
    this.bus = game.assets.instance('bus');
    for (const n of ['wheel_FL', 'wheel_FR', 'wheel_BL', 'wheel_BR']) {
      const w = this.bus.getObjectByName(n);
      if (w) this.wheels.push(w);
    }
    if (game.assets.has('char_driver')) {
      const d = game.assets.instance('char_driver');
      d.position.set(-0.55, 0.55, 3.0);
      d.scale.setScalar(0.95);
      this.bus.add(d);
      this.driver = { obj: d, rig: new CharacterRig(d) };
    }
    game.scene.add(this.bus);
    this.skipBtn = h('button', { class: 'btn skip-btn' }, 'Пропустить сцену ', h('span', { class: 'kbd wide' }, 'Enter'));
    this.skipBtn.addEventListener('click', () => this.skip());
    game.uiRoot.append(this.skipBtn);
    this.placeBus(0);
    game.audio.startLoop('engine');
  }

  /** Пройденный путь автобуса до остановки: равномерно, затем плавное торможение. */
  private sIn(t: number): number {
    const v = this.inLen / (0.925 * T_ARRIVE);
    const tb = 0.85 * T_ARRIVE;
    if (t <= tb) return v * t;
    const u = Math.min(t, T_ARRIVE) - tb;
    return Math.min(this.inLen, v * tb + v * u - (v * u * u) / (2 * 0.15 * T_ARRIVE));
  }

  private placeOnCurve(curve: THREE.CatmullRomCurve3, len: number, s: number): void {
    const u = THREE.MathUtils.clamp(s / len, 0, 1);
    const p = curve.getPointAt(u);
    const tan = curve.getTangentAt(u);
    this.bus.position.copy(p);
    this.bus.rotation.y = Math.atan2(tan.x, tan.z);
  }

  private lastS = 0;

  private placeBus(t: number): void {
    const s = this.sIn(t);
    this.placeOnCurve(this.inCurve, this.inLen, s);
    for (const w of this.wheels) w.rotation.x += (s - this.lastS) / 0.48;
    this.lastS = s;
  }

  skip(): void {
    if (this.done) return;
    this.finish(true);
  }

  private finish(skipped: boolean): void {
    if (this.done) return;
    this.done = true;
    this.skipBtn.remove();
    this.game.audio.stopLoop('engine');
    this.game.scene.remove(this.bus);
    this.game.cameraDriven = false;
    void this.game.ui.fade(false, 400);
    this.onDone(skipped);
  }

  update(frameDt: number): void {
    if (this.done) return;
    const game = this.game;
    if (game.input.wasPressedRaw('confirm')) {
      this.skip();
      return;
    }
    this.t += frameDt;
    const t = this.t;
    const cam = game.camera;
    this.driver?.rig.update(frameDt, 0);
    if (t < T_FP) {
      this.placeBus(t);
      const bp = this.bus.position;
      if (!this.titled && t > 1.5) {
        this.titled = true;
        void game.ui.titleCard('Дубравка', 'деревня у леса', 3600);
      }
      if (t < 8) {
        // Кадр 1: у лесной дороги, автобус едет на камеру.
        cam.position.set(2.8, groundHeight(2.8, 64) + 1.25, 64 - t * 0.6);
        cam.lookAt(bp.x, bp.y + 1.6, bp.z);
      } else if (t < 16) {
        // Кадр 2: пролёт над деревней.
        const k = (t - 8) / 8;
        cam.position.set(THREE.MathUtils.lerp(20, 6, k), THREE.MathUtils.lerp(27, 17, k), THREE.MathUtils.lerp(46, 20, k));
        const look = new THREE.Vector3(0, 0, -8).lerp(new THREE.Vector3(bp.x, 0, bp.z), 0.35);
        cam.lookAt(look);
      } else {
        // Кадр 3: остановка, автобус подъезжает.
        const k = Math.min(1, (t - 16) / (T_FADE - 16));
        cam.position.set(THREE.MathUtils.lerp(-12.6, -15.6, k), 1.75 + k * 0.2, THREE.MathUtils.lerp(11.6, 13.4, k));
        cam.lookAt(bp.x + 0.6, bp.y + 1.5, bp.z);
        if (!this.doorSound && t > T_ARRIVE + 0.6) {
          this.doorSound = true;
          game.audio.play('door');
          game.audio.stopLoop('engine');
        }
      }
      if (!this.faded && t > T_FADE) {
        this.faded = true;
        void game.ui.fade(true, 550);
      }
    } else {
      if (!this.fpDone) {
        // Вид от первого лица у остановки, автобус уезжает.
        this.fpDone = true;
        game.player.teleport(PLAYER_ARRIVAL.x, PLAYER_ARRIVAL.z);
        game.player.lookAt(BUS_STOP_POINT[0] + 1.5, 1.5, BUS_STOP_POINT[1] + 2.5);
        game.cameraDriven = false;
        game.player.frozen = true;
        void game.ui.fade(false, 650);
        game.audio.startLoop('engine');
        this.outS = 0;
        this.outV = 0;
      }
      this.outV = Math.min(7, this.outV + frameDt * 2.2);
      this.outS += this.outV * frameDt;
      this.placeOnCurve(this.outCurve, this.outLen, this.outS);
      for (const w of this.wheels) w.rotation.x += (this.outV * frameDt) / 0.48;
      // Игрок может осмотреться (без движения).
      game.player.lookFrozen = false;
      game.input.gameplayEnabled = true;
      game.player.update(frameDt);
      game.input.gameplayEnabled = false;
      if (t > T_END) this.finish(false);
    }
  }
}
