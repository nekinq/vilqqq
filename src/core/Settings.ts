import { EventBus } from './EventBus';

export type Action =
  | 'forward'
  | 'back'
  | 'left'
  | 'right'
  | 'sprint'
  | 'interact'
  | 'primary'
  | 'secondary'
  | 'hands'
  | 'broom'
  | 'tablet'
  | 'crouch'
  | 'pause'
  | 'rotate'
  | 'confirm';

export const ACTIONS: readonly Action[] = [
  'forward',
  'back',
  'left',
  'right',
  'sprint',
  'interact',
  'primary',
  'secondary',
  'hands',
  'broom',
  'tablet',
  'crouch',
  'pause',
  'rotate',
  'confirm',
];

export const ACTION_LABELS: Record<Action, string> = {
  forward: 'Вперёд',
  back: 'Назад',
  left: 'Влево',
  right: 'Вправо',
  sprint: 'Бег',
  interact: 'Взаимодействовать',
  primary: 'Основное действие',
  secondary: 'Второе действие',
  hands: 'Руки',
  broom: 'Метла',
  tablet: 'Планшет',
  crouch: 'Присесть',
  pause: 'Пауза / назад',
  rotate: 'Повернуть объект',
  confirm: 'Подтвердить',
};

export const DEFAULT_BINDINGS: Record<Action, string[]> = {
  forward: ['KeyW'],
  back: ['KeyS'],
  left: ['KeyA'],
  right: ['KeyD'],
  sprint: ['ShiftLeft'],
  interact: ['KeyE'],
  primary: ['Mouse0'],
  secondary: ['Mouse2'],
  hands: ['Digit1'],
  broom: ['Digit2'],
  tablet: ['Tab'],
  crouch: ['ControlLeft'],
  pause: ['Escape'],
  rotate: ['KeyR'],
  confirm: ['Enter'],
};

export type QualityPreset = 'low' | 'medium' | 'high';
export type ShadowQuality = 'off' | 'low' | 'high';

export interface GameSettings {
  graphics: {
    preset: QualityPreset;
    renderScale: number; // 0.5..1
    shadows: ShadowQuality;
    drawDistance: number; // метры, 60..220
    postProcessing: boolean;
    fpsLimit: 0 | 30 | 60; // 0 — без ограничения (VSync браузера)
    grassDensity: number; // 0..1
  };
  audio: {
    master: number;
    music: number;
    effects: number;
    voices: number;
  };
  controls: {
    sensitivity: number; // 0.2..3
    invertY: boolean;
    bindings: Record<Action, string[]>;
  };
  general: {
    autosave: boolean;
    showFps: boolean;
  };
}

export const PRESETS: Record<QualityPreset, GameSettings['graphics']> = {
  low: { preset: 'low', renderScale: 0.75, shadows: 'off', drawDistance: 90, postProcessing: false, fpsLimit: 0, grassDensity: 0.35 },
  medium: { preset: 'medium', renderScale: 1, shadows: 'low', drawDistance: 150, postProcessing: false, fpsLimit: 0, grassDensity: 0.7 },
  high: { preset: 'high', renderScale: 1, shadows: 'high', drawDistance: 220, postProcessing: true, fpsLimit: 0, grassDensity: 1 },
};

export function defaultSettings(): GameSettings {
  return {
    graphics: { ...PRESETS.medium },
    audio: { master: 0.8, music: 0.5, effects: 0.8, voices: 0.8 },
    controls: {
      sensitivity: 1,
      invertY: false,
      bindings: structuredClone(DEFAULT_BINDINGS),
    },
    general: { autosave: true, showFps: false },
  };
}

const STORAGE_KEY = 'dubravka.settings.v1';

interface SettingsEvents {
  changed: GameSettings;
}

/** Настройки игрока. Хранятся в localStorage (это «маленькие предпочтения», не сейв игры). */
export class Settings {
  readonly events = new EventBus<SettingsEvents>();
  data: GameSettings;

  constructor() {
    this.data = Settings.load();
  }

  static load(): GameSettings {
    const def = defaultSettings();
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return def;
      const parsed = JSON.parse(raw) as Partial<GameSettings>;
      const merged: GameSettings = {
        graphics: { ...def.graphics, ...(parsed.graphics ?? {}) },
        audio: { ...def.audio, ...(parsed.audio ?? {}) },
        controls: {
          ...def.controls,
          ...(parsed.controls ?? {}),
          bindings: { ...def.controls.bindings, ...(parsed.controls?.bindings ?? {}) },
        },
        general: { ...def.general, ...(parsed.general ?? {}) },
      };
      return merged;
    } catch {
      return def;
    }
  }

  save(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
    } catch {
      /* приватный режим — настройки живут только в памяти */
    }
    this.events.emit('changed', this.data);
  }

  update(mutator: (s: GameSettings) => void): void {
    mutator(this.data);
    this.save();
  }

  applyPreset(preset: QualityPreset): void {
    this.update((s) => {
      s.graphics = { ...PRESETS[preset] };
    });
  }

  resetBindings(): void {
    this.update((s) => {
      s.controls.bindings = structuredClone(DEFAULT_BINDINGS);
    });
  }
}

/** Человекочитаемое имя клавиши для подсказок. */
export function keyLabel(code: string): string {
  const map: Record<string, string> = {
    Mouse0: 'ЛКМ',
    Mouse1: 'СКМ',
    Mouse2: 'ПКМ',
    Mouse3: 'Мышь 4',
    Mouse4: 'Мышь 5',
    Space: 'Пробел',
    Enter: 'Enter',
    Escape: 'Esc',
    Tab: 'Tab',
    ShiftLeft: 'Shift',
    ShiftRight: 'R-Shift',
    ControlLeft: 'Ctrl',
    ControlRight: 'R-Ctrl',
    AltLeft: 'Alt',
    AltRight: 'R-Alt',
    Backspace: 'Backspace',
    ArrowUp: '↑',
    ArrowDown: '↓',
    ArrowLeft: '←',
    ArrowRight: '→',
    CapsLock: 'Caps',
    Backquote: '`',
  };
  if (map[code]) return map[code]!;
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return 'Num' + code.slice(6);
  return code;
}
