import * as THREE from 'three';
import { damp, dampAngle } from '../core/math';

/**
 * Процедурная анимация персонажа по узлам модели (leg_L/R, arm_L/R, body, head):
 * шаг (амплитуда от скорости), дыхание, рука тянется (взять товар, оплатить),
 * корзина в левой руке, поворот головы к цели.
 */
export class CharacterRig {
  readonly legL: THREE.Object3D | null;
  readonly legR: THREE.Object3D | null;
  readonly armL: THREE.Object3D | null;
  readonly armR: THREE.Object3D | null;
  readonly body: THREE.Object3D | null;
  readonly head: THREE.Object3D | null;
  private phase = Math.random() * 6;
  private amp = 0;
  private t = Math.random() * 10;
  private reachT = 0;
  private reachDur = 0;
  private nodT = 0;
  private bodyY0: number;
  private headYaw = 0;
  /** Желаемый поворот головы относительно корпуса (рад). */
  lookYaw = 0;
  holdBasket = false;
  /** Поза «скрестил руки» в очереди при нетерпении. */
  impatient = 0;

  constructor(readonly obj: THREE.Object3D) {
    this.legL = obj.getObjectByName('leg_L') ?? null;
    this.legR = obj.getObjectByName('leg_R') ?? null;
    this.armL = obj.getObjectByName('arm_L') ?? null;
    this.armR = obj.getObjectByName('arm_R') ?? null;
    this.body = obj.getObjectByName('body') ?? null;
    this.head = obj.getObjectByName('head') ?? null;
    this.bodyY0 = this.body?.position.y ?? 0;
  }

  /** Протянуть правую руку (сек). */
  reach(dur = 0.9): void {
    this.reachT = dur;
    this.reachDur = dur;
  }

  /** Кивнуть / заговорить. */
  nod(dur = 1.2): void {
    this.nodT = dur;
  }

  update(dt: number, speed: number): void {
    this.t += dt;
    const target = Math.min(1, speed / 1.25);
    this.amp = damp(this.amp, target, 8, dt);
    this.phase += dt * (3.2 + speed * 3.4) * (this.amp > 0.02 ? 1 : 0);
    const s = Math.sin(this.phase);
    const a = this.amp;
    if (this.legL) this.legL.rotation.x = s * 0.55 * a;
    if (this.legR) this.legR.rotation.x = -s * 0.55 * a;
    // Руки: левая с корзиной почти не качается.
    if (this.armL) this.armL.rotation.x = this.holdBasket ? -0.28 - s * 0.08 * a : -s * 0.42 * a + Math.sin(this.t * 1.3) * 0.02;
    let rx = s * 0.42 * a + Math.sin(this.t * 1.3 + 1) * 0.02;
    if (this.reachT > 0) {
      this.reachT = Math.max(0, this.reachT - dt);
      const k = Math.sin((1 - this.reachT / this.reachDur) * Math.PI);
      rx = -1.25 * k;
    }
    if (this.impatient > 0.01 && this.reachT <= 0) rx = rx * (1 - this.impatient) - 0.5 * this.impatient;
    if (this.armR) this.armR.rotation.x = rx;
    if (this.body) {
      this.body.position.y = this.bodyY0 + Math.abs(Math.cos(this.phase)) * 0.035 * a;
      this.body.rotation.x = 0.05 * a + Math.sin(this.t * 1.8) * 0.008 * (1 - a);
      this.body.rotation.z = Math.sin(this.phase) * 0.025 * a;
    }
    if (this.head) {
      this.headYaw = dampAngle(this.headYaw, Math.max(-1.0, Math.min(1.0, this.lookYaw)), 5, dt);
      this.head.rotation.y = this.headYaw;
      let hx = Math.sin(this.t * 0.9) * 0.02;
      if (this.nodT > 0) {
        this.nodT = Math.max(0, this.nodT - dt);
        hx += Math.sin(this.nodT * 9) * 0.12;
      }
      this.head.rotation.x = hx;
    }
  }
}
