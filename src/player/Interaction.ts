import * as THREE from 'three';
import type { Input } from '../core/Input';
import type { Action } from '../core/Settings';

/** Подсказка: одна строка «[клавиша] — действие» (+ дополнительные пары). */
export interface PromptPart {
  action: Action | 'hold';
  text: string;
}

export interface Prompt {
  parts: PromptPart[];
  /** Прогресс удержания (0..1) — для досок, пятен. */
  progress?: number;
  /** Пояснение мелким шрифтом (причина отказа). */
  note?: string;
}

export interface Interactable {
  id: string;
  /** Невидимые хитбоксы или видимые меши для raycast. */
  hits: THREE.Object3D[];
  reach?: number;
  enabled?: () => boolean;
  prompt(): Prompt | null;
  onInteract?(): void;
  onPrimary?(): void;
  onPrimaryHold?(dt: number): void;
  onPrimaryRelease?(): void;
  onSecondary?(): void;
}

/** Обработчики «без цели» (бросить коробку на пол, мести пол) — задаются игрой. */
export interface FallbackHandler {
  prompt(point: THREE.Vector3 | null): Prompt | null;
  onInteract?(point: THREE.Vector3 | null): void;
  onPrimary?(point: THREE.Vector3 | null): void;
  onPrimaryHold?(dt: number, point: THREE.Vector3 | null): void;
  onPrimaryRelease?(): void;
  onSecondary?(point: THREE.Vector3 | null): void;
}

const CENTER = new THREE.Vector2(0, 0);

/** Хитбокс: невидимый меш (raycast работает и для невидимых). */
export function hitBox(w: number, h: number, d: number): THREE.Mesh {
  const m = new THREE.Mesh(HIT_GEO, HIT_MAT);
  m.scale.set(w, h, d);
  m.visible = false;
  m.name = 'hit';
  return m;
}
const HIT_GEO = new THREE.BoxGeometry(1, 1, 1);
// Двусторонний: луч из точки внутри хитбокса тоже засчитывается.
const HIT_MAT = new THREE.MeshBasicMaterial({ color: 0xff00ff, wireframe: true, side: THREE.DoubleSide });

/**
 * Взаимодействие от первого лица: raycast из центра экрана, ближайшая цель в пределах досягаемости,
 * одна контекстная подсказка, маршрутизация E/ЛКМ/ПКМ/удержания.
 */
export class Interaction {
  private targets = new Map<string, Interactable>();
  private hitList: THREE.Object3D[] = [];
  private occluders: THREE.Object3D[] = [];
  private dirty = true;
  private raycaster = new THREE.Raycaster();
  focus: Interactable | null = null;
  focusPoint = new THREE.Vector3();
  focusDistance = 0;
  /** Точка на полу/земле под прицелом (для «бросить сюда», метлы). */
  floorPoint: THREE.Vector3 | null = null;
  fallback: FallbackHandler | null = null;
  currentPrompt: Prompt | null = null;
  enabled = true;
  /** Только луч и точка пола, без подсказок и ввода (режим расстановки). */
  passive = false;
  private holding = false;
  maxReach = 2.6;
  /** Плоскости пола для точки прицела: функция высоты. */
  floorHeight: ((x: number, z: number) => number) | null = null;

  constructor(
    private readonly camera: THREE.Camera,
    private readonly input: Input,
  ) {
    this.raycaster.far = 4;
  }

  register(t: Interactable): void {
    this.targets.set(t.id, t);
    for (const h of t.hits) h.userData.interactable = t.id;
    this.dirty = true;
  }

  unregister(id: string): void {
    const t = this.targets.get(id);
    if (!t) return;
    for (const h of t.hits) delete h.userData.interactable;
    this.targets.delete(id);
    if (this.focus?.id === id) this.focus = null;
    this.dirty = true;
  }

  has(id: string): boolean {
    return this.targets.has(id);
  }

  addOccluder(o: THREE.Object3D): void {
    this.occluders.push(o);
  }

  private rebuild(): void {
    this.hitList = [];
    for (const t of this.targets.values()) for (const h of t.hits) this.hitList.push(h);
    this.dirty = false;
  }

  update(dt: number): void {
    if (!this.enabled) {
      if (this.holding) this.release();
      this.focus = null;
      this.currentPrompt = null;
      return;
    }
    if (this.dirty) this.rebuild();
    this.raycaster.setFromCamera(CENTER, this.camera);
    this.raycaster.far = 4.2;
    if (this.passive) {
      if (this.holding) this.release();
      this.focus = null;
      this.currentPrompt = null;
      this.floorPoint = this.computeFloorPoint();
      return;
    }
    const hits = this.raycaster.intersectObjects([...this.hitList, ...this.occluders], false);
    let found: Interactable | null = null;
    for (const h of hits) {
      const id = h.object.userData.interactable as string | undefined;
      if (!id) {
        // Окклюдер (стена) ближе цели — дальше не смотрим.
        break;
      }
      const t = this.targets.get(id);
      if (!t) continue;
      if (t.enabled && !t.enabled()) continue;
      if (h.distance > (t.reach ?? this.maxReach)) break;
      found = t;
      this.focusPoint.copy(h.point);
      this.focusDistance = h.distance;
      break;
    }
    if (this.holding && this.focus && found !== this.focus) this.release();
    this.focus = found;
    this.floorPoint = this.computeFloorPoint();

    // Подсказка.
    if (found) this.currentPrompt = found.prompt();
    else this.currentPrompt = this.fallback?.prompt(this.floorPoint) ?? null;

    // Ввод.
    const t = this.focus;
    if (this.input.wasPressed('interact')) {
      if (t?.onInteract) t.onInteract();
      else this.fallback?.onInteract?.(this.floorPoint);
    }
    if (this.input.wasPressed('primary')) {
      this.holding = true;
      if (t?.onPrimary) t.onPrimary();
      else if (!t?.onPrimaryHold) this.fallback?.onPrimary?.(this.floorPoint);
    }
    if (this.holding && this.input.isDown('primary')) {
      if (t?.onPrimaryHold) t.onPrimaryHold(dt);
      else if (!t) this.fallback?.onPrimaryHold?.(dt, this.floorPoint);
    }
    if (this.holding && (this.input.wasReleased('primary') || !this.input.isDown('primary'))) this.release();
    if (this.input.wasPressed('secondary')) {
      if (t?.onSecondary) t.onSecondary();
      else this.fallback?.onSecondary?.(this.floorPoint);
    }
  }

  private release(): void {
    this.holding = false;
    this.focus?.onPrimaryRelease?.();
    this.fallback?.onPrimaryRelease?.();
  }

  /** Луч взгляда (для систем, которым нужна своя проверка попаданий). */
  get ray(): THREE.Ray {
    return this.raycaster.ray;
  }

  /** Сейчас удерживается основное действие на цели. */
  get isHolding(): boolean {
    return this.holding;
  }

  /** Точка пересечения луча взгляда с полом (по карте высот), в пределах 3 м. */
  private computeFloorPoint(): THREE.Vector3 | null {
    if (!this.floorHeight) return null;
    const o = this.raycaster.ray.origin;
    const d = this.raycaster.ray.direction;
    if (d.y > -0.05) return null;
    // Марш по лучу: высота пола меняется ступенями.
    const p = new THREE.Vector3();
    for (let t = 0.3; t < 3.2; t += 0.05) {
      p.copy(o).addScaledVector(d, t);
      const fy = this.floorHeight(p.x, p.z);
      if (p.y <= fy) {
        p.y = fy;
        return p;
      }
    }
    return null;
  }
}
