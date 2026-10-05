import { h, setText, setClass, clear } from './dom';
import { icon } from './icons';
import { keyLabel, type Settings, type Action } from '../core/Settings';
import type { Prompt } from '../player/Interaction';
import { formatClock } from '../core/math';
import type { Phase } from '../game/state';

const PHASE_LABEL: Record<Phase, string> = {
  preparation: 'Подготовка',
  open: 'Открыто',
  closing: 'Закрытие',
  report: 'Итоги',
};

/**
 * HUD по референсу UI-01: слева сверху день/время/статус и цель, справа сверху баланс,
 * уровень и репутация, по центру прицел, внизу одна контекстная подсказка, справа слоты.
 */
export class HUD {
  readonly root: HTMLDivElement;
  private day = h('span', { class: 'v' });
  private clock = h('span', { class: 'v' });
  private status = h('span', { class: 'v' });
  private statusDot = h('span', { class: 'dot' });
  private objective = h('div', { class: 'hud-objective pill' });
  private objectiveText = h('span');
  private money = h('span', { class: 'money-val' });
  private level = h('span', { class: 'v' });
  private rep = h('span', { class: 'v' });
  private crosshair = h('div', { class: 'crosshair' });
  private prompt = h('div', { class: 'hud-prompt' });
  private promptProgress = h('div', { class: 'prompt-progress' }, h('i'));
  private cashInfo = h('div', { class: 'hud-cash pill' });
  private slots: Record<'hands' | 'broom' | 'tablet', HTMLElement>;
  private toasts = h('div', { class: 'toasts' });
  private subtitles = h('div', { class: 'subtitles' });
  private lastPromptKey = '';
  private moneyFlash = 0;
  private fps = h('div', { class: 'fps' });
  private marker = h('div', { class: 'world-marker' }, h('i'), h('span'));

  constructor(
    parent: HTMLElement,
    private readonly settings: Settings,
  ) {
    const slot = (key: string, name: string, ic: HTMLElement) => h('div', { class: 'slot' }, h('div', { class: 'slot-ic' }, ic), h('div', { class: 'slot-key' }, key), h('div', { class: 'slot-name' }, name));
    this.slots = {
      hands: slot('1', 'Руки', icon('box')),
      broom: slot('2', 'Метла', icon('broom')),
      tablet: slot('Tab', 'Планшет', icon('tablet')),
    };
    this.objective.append(h('span', { class: 'obj-ic' }, '!'), this.objectiveText);
    this.root = h(
      'div',
      { class: 'hud' },
      h(
        'div',
        { class: 'hud-tl' },
        h('div', { class: 'pill row' }, h('span', { class: 'cell' }, icon('calendar'), 'День ', this.day), h('span', { class: 'sep' }), h('span', { class: 'cell' }, icon('clock'), this.clock), h('span', { class: 'sep' }), h('span', { class: 'cell' }, this.statusDot, this.status)),
        this.objective,
      ),
      h(
        'div',
        { class: 'hud-tr' },
        h('div', { class: 'pill row money' }, icon('wallet'), h('span', { class: 'lbl' }, 'Баланс'), this.money),
        h('div', { class: 'pill row small' }, h('span', { class: 'cell' }, icon('star'), 'Уровень ', this.level), h('span', { class: 'sep' }), h('span', { class: 'cell' }, icon('thumb'), 'Репутация ', this.rep)),
      ),
      this.crosshair,
      h('div', { class: 'hud-bottom' }, this.prompt, this.promptProgress),
      h('div', { class: 'hud-br' }, this.cashInfo, h('div', { class: 'slots' }, this.slots.hands, this.slots.broom, this.slots.tablet)),
      this.toasts,
      this.subtitles,
      this.fps,
      this.marker,
    );
    parent.append(this.root);
    this.cashInfo.style.display = 'none';
    this.objective.style.display = 'none';
    this.marker.style.display = 'none';
    this.prompt.style.display = 'none';
    this.promptProgress.style.display = 'none';
  }

  /** Кат-сцена: только субтитры и уведомления. */
  setCinematic(on: boolean): void {
    setClass(this.root, 'cine', on);
  }

  /** Маркер цели в мире (экранные координаты в пикселях). */
  setMarker(m: { x: number; y: number; dist: number; edge: boolean } | null): void {
    if (!m) {
      if (this.marker.style.display !== 'none') this.marker.style.display = 'none';
      return;
    }
    this.marker.style.display = '';
    this.marker.style.transform = `translate(${Math.round(m.x)}px, ${Math.round(m.y)}px)`;
    setClass(this.marker, 'edge', m.edge);
    setText(this.marker.lastChild as HTMLElement, m.dist >= 1 ? `${Math.round(m.dist)} м` : '');
  }

  setVisible(v: boolean): void {
    this.root.style.display = v ? '' : 'none';
  }

  setTop(day: number, minutes: number, phase: Phase): void {
    setText(this.day, String(day));
    setText(this.clock, formatClock(minutes));
    setText(this.status, PHASE_LABEL[phase]);
    this.statusDot.className = `dot ${phase}`;
  }

  setStats(money: number, level: number, rep: number): void {
    const t = String(Math.round(money));
    if (this.money.textContent !== t) {
      this.money.textContent = t;
      this.moneyFlash = 0.6;
      this.money.classList.add('flash');
    }
    setText(this.level, String(level));
    setText(this.rep, String(Math.round(rep)));
  }

  setObjective(text: string | null): void {
    if (!text) {
      this.objective.style.display = 'none';
      return;
    }
    this.objective.style.display = '';
    setText(this.objectiveText, text);
  }

  setTool(tool: 'hands' | 'broom', tabletOpen: boolean): void {
    setClass(this.slots.hands, 'active', tool === 'hands' && !tabletOpen);
    setClass(this.slots.broom, 'active', tool === 'broom' && !tabletOpen);
    setClass(this.slots.tablet, 'active', tabletOpen);
  }

  setFocus(focused: boolean): void {
    setClass(this.crosshair, 'focus', focused);
  }

  setCrosshair(visible: boolean): void {
    this.crosshair.style.display = visible ? '' : 'none';
  }

  setPrompt(p: Prompt | null): void {
    const key = p ? JSON.stringify(p.parts) + (p.note ?? '') : '';
    if (key !== this.lastPromptKey) {
      this.lastPromptKey = key;
      clear(this.prompt);
      if (p && p.parts.length) {
        p.parts.forEach((part, i) => {
          if (i > 0) this.prompt.append(h('span', { class: 'dotsep' }, '•'));
          const code = part.action === 'hold' ? this.keyFor('primary') : this.keyFor(part.action);
          const hold = part.action === 'hold';
          this.prompt.append(h('span', { class: 'kbd' + (code.length > 2 ? ' wide' : '') }, code), h('span', { class: 'txt' }, (hold ? 'Удерживайте — ' : '— ') + part.text));
        });
        if (p.note) this.prompt.append(h('span', { class: 'note' }, p.note));
        this.prompt.style.display = '';
      } else this.prompt.style.display = 'none';
    }
    const prog = p?.progress;
    this.promptProgress.style.display = prog !== undefined && prog > 0 ? '' : 'none';
    if (prog !== undefined) (this.promptProgress.firstChild as HTMLElement).style.width = `${Math.round(prog * 100)}%`;
  }

  private keyFor(action: Action): string {
    const codes = this.settings.data.controls.bindings[action];
    return codes && codes[0] ? keyLabel(codes[0]) : '?';
  }

  setCash(info: { given: number; change: number } | null): void {
    if (!info) {
      this.cashInfo.style.display = 'none';
      return;
    }
    this.cashInfo.style.display = '';
    clear(this.cashInfo);
    this.cashInfo.append(icon('coin'), h('span', null, `Наличные ${info.given}`), h('span', { class: 'dotsep' }, '•'), h('span', null, `Сдача ${info.change}`));
  }

  toast(text: string, kind: 'info' | 'good' | 'bad' | 'level' = 'info'): void {
    const el = h('div', { class: `toast ${kind}` }, text);
    this.toasts.append(el);
    while (this.toasts.children.length > 3) this.toasts.firstChild?.remove();
    setTimeout(() => el.classList.add('out'), 3200);
    setTimeout(() => el.remove(), 3700);
  }

  subtitle(speaker: string | null, text: string | null): void {
    clear(this.subtitles);
    if (!text) return;
    if (speaker) this.subtitles.append(h('b', null, speaker + ': '));
    this.subtitles.append(text);
  }

  setFps(text: string | null): void {
    this.fps.style.display = text ? '' : 'none';
    if (text) setText(this.fps, text);
  }

  update(dt: number): void {
    if (this.moneyFlash > 0) {
      this.moneyFlash -= dt;
      if (this.moneyFlash <= 0) this.money.classList.remove('flash');
    }
  }
}
