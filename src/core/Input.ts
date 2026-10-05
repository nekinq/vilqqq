import type { Action, Settings } from './Settings';
import { ACTIONS } from './Settings';

/** Коды, у которых браузер по умолчанию делает что-то мешающее игре. */
const PREVENT_DEFAULT = new Set(['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Backspace', 'Slash', 'Quote', 'F1']);

/**
 * Ввод: состояние клавиш и кнопок мыши по «действиям» с переназначением,
 * дельта мыши (Pointer Lock), события «нажато в этом кадре».
 */
export class Input {
  private down = new Set<string>();
  private pressedThisFrame = new Set<string>();
  private releasedThisFrame = new Set<string>();
  private pendingPressed = new Set<string>();
  private pendingReleased = new Set<string>();
  private mouseDX = 0;
  private mouseDY = 0;
  private pendingDX = 0;
  private pendingDY = 0;
  private wheel = 0;
  private pendingWheel = 0;
  private captureCb: ((code: string) => void) | null = null;
  /** Игровой ввод (движение/действия) включён. В меню и модалках — выключен. */
  gameplayEnabled = false;
  /** Нужен ли захват указателя для игрового режима. */
  wantPointerLock = false;
  onPointerLockLost: (() => void) | null = null;
  onPointerLockFailed: (() => void) | null = null;
  private lastLockRequest = 0;
  /** Время последнего ввода (для автопаузы/подсказок). */
  lastInputTime = performance.now();

  constructor(
    private readonly element: HTMLElement,
    private readonly settings: Settings,
  ) {
    window.addEventListener('keydown', this.onKeyDown, { capture: true });
    window.addEventListener('keyup', this.onKeyUp, { capture: true });
    element.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
    window.addEventListener('mousemove', this.onMouseMove);
    element.addEventListener('wheel', this.onWheel, { passive: true });
    element.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', this.onLockChange);
    document.addEventListener('pointerlockerror', () => this.onPointerLockFailed?.());
    window.addEventListener('blur', () => this.releaseAll());
  }

  get locked(): boolean {
    return document.pointerLockElement === this.element;
  }

  /** Вызывается в начале кадра: переносит накопленные события в «этот кадр». */
  beginFrame(): void {
    this.pressedThisFrame = this.pendingPressed;
    this.releasedThisFrame = this.pendingReleased;
    this.pendingPressed = new Set();
    this.pendingReleased = new Set();
    this.mouseDX = this.pendingDX;
    this.mouseDY = this.pendingDY;
    this.pendingDX = 0;
    this.pendingDY = 0;
    this.wheel = this.pendingWheel;
    this.pendingWheel = 0;
  }

  private codesFor(action: Action): string[] {
    return this.settings.data.controls.bindings[action] ?? [];
  }

  isDown(action: Action): boolean {
    if (!this.gameplayEnabled && action !== 'pause' && action !== 'confirm' && action !== 'tablet') return false;
    for (const c of this.codesFor(action)) if (this.down.has(c)) return true;
    return false;
  }

  wasPressed(action: Action): boolean {
    if (!this.gameplayEnabled && action !== 'pause' && action !== 'confirm' && action !== 'tablet') return false;
    for (const c of this.codesFor(action)) if (this.pressedThisFrame.has(c)) return true;
    return false;
  }

  /** Нажатие независимо от игрового режима (для UI-горячих клавиш). */
  wasPressedRaw(action: Action): boolean {
    for (const c of this.codesFor(action)) if (this.pressedThisFrame.has(c)) return true;
    return false;
  }

  wasReleased(action: Action): boolean {
    for (const c of this.codesFor(action)) if (this.releasedThisFrame.has(c)) return true;
    return false;
  }

  /** Дельта мыши за кадр (только в захвате указателя). */
  get look(): { dx: number; dy: number } {
    if (!this.gameplayEnabled || !this.locked) return { dx: 0, dy: 0 };
    return { dx: this.mouseDX, dy: this.mouseDY };
  }

  get wheelDelta(): number {
    return this.wheel;
  }

  /** Захватить следующую нажатую клавишу/кнопку (для переназначения). */
  captureNext(cb: (code: string) => void): void {
    this.captureCb = cb;
  }

  cancelCapture(): void {
    this.captureCb = null;
  }

  get capturing(): boolean {
    return this.captureCb !== null;
  }

  requestLock(): void {
    if (this.locked) return;
    const now = performance.now();
    if (now - this.lastLockRequest < 250) return;
    this.lastLockRequest = now;
    try {
      const res = this.element.requestPointerLock({ unadjustedMovement: false } as never) as unknown;
      if (res && typeof (res as Promise<void>).catch === 'function') {
        (res as Promise<void>).catch(() => this.onPointerLockFailed?.());
      }
    } catch {
      this.onPointerLockFailed?.();
    }
  }

  exitLock(): void {
    if (this.locked) document.exitPointerLock();
  }

  releaseAll(): void {
    for (const c of this.down) this.pendingReleased.add(c);
    this.down.clear();
  }

  /** Список действий, к которым привязан код (для проверки конфликтов). */
  actionsForCode(code: string): Action[] {
    return ACTIONS.filter((a) => this.codesFor(a).includes(code));
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    this.lastInputTime = performance.now();
    if (this.captureCb) {
      e.preventDefault();
      e.stopPropagation();
      const cb = this.captureCb;
      this.captureCb = null;
      cb(e.code);
      return;
    }
    const target = e.target as HTMLElement | null;
    const typing = !!target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') && (target as HTMLInputElement).type !== 'range';
    if (typing && e.code !== 'Escape' && e.code !== 'Enter' && e.code !== 'Tab') return;
    if (PREVENT_DEFAULT.has(e.code)) e.preventDefault();
    if (this.gameplayEnabled && (e.ctrlKey || e.metaKey) && ['KeyW', 'KeyS', 'KeyD', 'KeyA', 'KeyR', 'KeyE'].includes(e.code)) {
      // Ctrl+S/D/R и пр. в браузере мешают игре; Ctrl+W браузер не даёт отменить — защищает beforeunload.
      e.preventDefault();
    }
    if (e.repeat) return;
    if (!this.down.has(e.code)) {
      this.down.add(e.code);
      this.pendingPressed.add(e.code);
    }
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    if (this.down.delete(e.code)) this.pendingReleased.add(e.code);
  };

  private onMouseDown = (e: MouseEvent): void => {
    this.lastInputTime = performance.now();
    const code = `Mouse${e.button}`;
    if (this.captureCb) {
      e.preventDefault();
      const cb = this.captureCb;
      this.captureCb = null;
      cb(code);
      return;
    }
    if (this.wantPointerLock && !this.locked) {
      this.requestLock();
      return; // клик для захвата не считается действием
    }
    if (!this.down.has(code)) {
      this.down.add(code);
      this.pendingPressed.add(code);
    }
  };

  private onMouseUp = (e: MouseEvent): void => {
    const code = `Mouse${e.button}`;
    if (this.down.delete(code)) this.pendingReleased.add(code);
  };

  private onMouseMove = (e: MouseEvent): void => {
    if (!this.locked) return;
    // Защита от редких огромных скачков movementX при захвате указателя.
    if (Math.abs(e.movementX) > 400 || Math.abs(e.movementY) > 400) return;
    this.pendingDX += e.movementX;
    this.pendingDY += e.movementY;
  };

  private onWheel = (e: WheelEvent): void => {
    this.pendingWheel += Math.sign(e.deltaY);
  };

  private onLockChange = (): void => {
    if (!this.locked) {
      this.releaseAll();
      if (this.wantPointerLock) this.onPointerLockLost?.();
    }
  };
}
