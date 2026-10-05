import * as THREE from 'three';
import type { Input } from '../core/Input';
import type { Settings } from '../core/Settings';
import type { CollisionWorld, FloorMap } from '../world/Colliders';
import { groundHeight } from '../world/Ground';
import { clamp, damp } from '../core/math';

/**
 * FPS-контроллер: WASD относительно взгляда, бег, присед, коллизия круга с миром,
 * подъём на ступени и платформы (до 0.45 м), лёгкое покачивание головы.
 */
export class PlayerController {
  readonly position = new THREE.Vector3();
  yaw = 0;
  pitch = 0;
  readonly radius = 0.3;
  private vel = new THREE.Vector2();
  private eye = 1.62;
  private bobT = 0;
  private bobAmp = 0;
  crouching = false;
  /** Блокировка движения (кат-сцены, модалки). */
  frozen = false;
  /** Блокировка обзора. */
  lookFrozen = false;
  onStep: ((surface: string) => void) | null = null;
  private lastStepPhase = 0;
  speedMul = 1;
  moving = false;

  constructor(
    readonly camera: THREE.PerspectiveCamera,
    private readonly input: Input,
    private readonly settings: Settings,
    private readonly colliders: CollisionWorld,
    private readonly floors: FloorMap,
  ) {}

  teleport(x: number, z: number, yaw?: number, pitch?: number): void {
    const y = this.floors.heightAt(x, z, groundHeight(x, z));
    this.position.set(x, y, z);
    if (yaw !== undefined) this.yaw = yaw;
    if (pitch !== undefined) this.pitch = pitch;
    this.vel.set(0, 0);
    this.syncCamera(0);
  }

  /** Повернуть взгляд на точку. */
  lookAt(x: number, y: number, z: number): void {
    const dx = x - this.position.x;
    const dz = z - this.position.z;
    const dy = y - (this.position.y + this.eye);
    this.yaw = Math.atan2(-dx, -dz);
    this.pitch = Math.atan2(dy, Math.hypot(dx, dz));
  }

  get eyeHeight(): number {
    return this.eye;
  }

  /** Направление взгляда в плоскости XZ. */
  forward(out = new THREE.Vector3()): THREE.Vector3 {
    return out.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
  }

  update(dt: number): void {
    // Обзор.
    if (!this.lookFrozen) {
      const { dx, dy } = this.input.look;
      const sens = 0.0022 * this.settings.data.controls.sensitivity;
      const inv = this.settings.data.controls.invertY ? -1 : 1;
      this.yaw -= dx * sens;
      this.pitch = clamp(this.pitch - dy * sens * inv, -1.45, 1.45);
    }
    // Присед.
    const wantCrouch = !this.frozen && this.input.isDown('crouch');
    this.crouching = wantCrouch;
    const targetEye = wantCrouch ? 1.0 : 1.62;
    this.eye = damp(this.eye, targetEye, 12, dt);

    // Движение.
    let mx = 0;
    let mz = 0;
    if (!this.frozen) {
      if (this.input.isDown('forward')) mz -= 1;
      if (this.input.isDown('back')) mz += 1;
      if (this.input.isDown('left')) mx -= 1;
      if (this.input.isDown('right')) mx += 1;
    }
    const len = Math.hypot(mx, mz);
    if (len > 0) {
      mx /= len;
      mz /= len;
    }
    const sprint = this.input.isDown('sprint') && !wantCrouch && mz < 0;
    const speed = (wantCrouch ? 1.7 : sprint ? 5.4 : 3.5) * this.speedMul;
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    const wx = (mx * cos + mz * sin) * speed;
    const wz = (-mx * sin + mz * cos) * speed;
    const accel = len > 0 ? 14 : 18;
    this.vel.x = damp(this.vel.x, wx, accel, dt);
    this.vel.y = damp(this.vel.y, wz, accel, dt);
    this.moving = this.vel.length() > 0.4;

    // Перемещение с подшагами и выталкиванием.
    const dist = this.vel.length() * dt;
    const steps = Math.max(1, Math.ceil(dist / 0.15));
    let x = this.position.x;
    let z = this.position.z;
    const footY = this.position.y;
    for (let i = 0; i < steps; i++) {
      const nx = x + (this.vel.x * dt) / steps;
      const nz = z + (this.vel.y * dt) / steps;
      // Слишком высокий уступ — не заходим.
      const ny = this.floors.heightAt(nx, nz, groundHeight(nx, nz));
      if (ny - footY > 0.46) break;
      const r = this.colliders.resolve(nx, nz, this.radius, (c) => c.tag !== 'npc_only');
      x = r.x;
      z = r.z;
    }
    this.position.x = x;
    this.position.z = z;
    const floorY = this.floors.heightAt(x, z, groundHeight(x, z));
    this.position.y = damp(this.position.y, floorY, floorY > this.position.y ? 16 : 22, dt);

    // Покачивание головы и шаги.
    const sp = this.vel.length();
    this.bobAmp = damp(this.bobAmp, sp > 0.5 ? Math.min(1, sp / 4) : 0, 8, dt);
    this.bobT += dt * (sprint ? 11 : wantCrouch ? 6 : 8.4) * (sp > 0.3 ? 1 : 0.3);
    const phase = Math.floor(this.bobT / Math.PI);
    if (phase !== this.lastStepPhase && sp > 0.8) {
      this.lastStepPhase = phase;
      const tag = this.floors.tagAt(x, z);
      this.onStep?.(tag === 'hall' || tag === 'warehouse' || tag === 'porch' || tag === 'delivery' ? 'wood' : 'ground');
    }
    this.syncCamera(dt);
  }

  private syncCamera(_dt: number): void {
    const bob = Math.sin(this.bobT * 2) * 0.035 * this.bobAmp;
    const sway = Math.cos(this.bobT) * 0.02 * this.bobAmp;
    this.camera.position.set(this.position.x, this.position.y + this.eye + bob, this.position.z);
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
    this.camera.rotateZ(sway * 0.15);
  }

  /** Текущая «волна» шага для вьюмодели. */
  get bob(): { t: number; amp: number } {
    return { t: this.bobT, amp: this.bobAmp };
  }
}
