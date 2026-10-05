import type { Game } from '../game/Game';
import { h, clear } from './dom';
import { icon, type IconName } from './icons';
import { ProductIcons } from './ProductIcons';
import type { ProductId, SupplierId } from '../data/products';
import type { DayLedger } from '../game/state';
import { openPrice, openCatalog, openReport, openDrawer, openTerminal } from './modals';
import { Tablet, type TabId } from './Tablet';
import { Menus } from './Menus';
import { Dialogue, type Line } from './Dialogue';

/** Модальное окно в стеке UI. */
export interface Modal {
  id: string;
  el: HTMLElement;
  /** Закрывать по Esc (по умолчанию — да). */
  esc?: boolean;
  onClose?(): void;
  update?(dt: number): void;
}

/** Каркас панели в стиле UI-02: зелёная шапка, кремовое тело. */
export function panel(title: string, opts: { icon?: IconName; cls?: string; onClose?: () => void } = {}): { overlay: HTMLElement; panel: HTMLElement; body: HTMLElement; head: HTMLElement } {
  const x = h('button', { class: 'x', title: 'Закрыть (Esc)' }, icon('close'));
  const head = h('div', { class: 'panel-head' }, h('span', { class: 'ph-title' }, opts.icon ? icon(opts.icon) : null, title), x);
  const body = h('div', { class: 'panel-body' });
  const p = h('div', { class: 'panel' + (opts.cls ? ' ' + opts.cls : '') }, head, body);
  const overlay = h('div', { class: 'overlay' }, p);
  x.addEventListener('click', () => opts.onClose?.());
  return { overlay, panel: p, body, head };
}

/**
 * Менеджер интерфейса: стек модальных окон (курсор отпускается, время идёт),
 * горячие клавиши (Esc, Tab), уведомления, меню, диалоги.
 */
export class UI {
  readonly layer: HTMLElement;
  private stack: Modal[] = [];
  readonly icons: ProductIcons;
  readonly tablet: Tablet;
  readonly menus: Menus;
  readonly dialogue: Dialogue;
  private fadeEl: HTMLElement;
  private titleEl: HTMLElement | null = null;

  constructor(readonly game: Game) {
    this.layer = h('div', { class: 'ui-layer' });
    game.uiRoot.append(this.layer);
    this.fadeEl = h('div', { class: 'fade' });
    game.uiRoot.append(this.fadeEl);
    this.icons = new ProductIcons(game.render.renderer, game.assets);
    this.tablet = new Tablet(this);
    this.menus = new Menus(this);
    this.dialogue = new Dialogue(this);
  }

  get sim() {
    return this.game.sim;
  }

  // ───────── Стек окон ─────────

  open(m: Modal): Modal {
    this.layer.append(m.el);
    this.stack.push(m);
    this.game.pushModal();
    return m;
  }

  close(m?: Modal): void {
    const target = m ?? this.stack[this.stack.length - 1];
    if (!target) return;
    const i = this.stack.indexOf(target);
    if (i < 0) return;
    this.stack.splice(i, 1);
    target.el.remove();
    this.game.popModal();
    target.onClose?.();
  }

  closeById(id: string): void {
    const m = this.stack.find((q) => q.id === id);
    if (m) this.close(m);
  }

  closeAll(): void {
    while (this.stack.length) this.close();
  }

  isOpen(id: string): boolean {
    return this.stack.some((m) => m.id === id);
  }

  get top(): Modal | null {
    return this.stack[this.stack.length - 1] ?? null;
  }

  get count(): number {
    return this.stack.length;
  }

  /** Горячие клавиши интерфейса (вызывается каждый кадр из игрового цикла). */
  handleHotkeys(): void {
    const inp = this.game.input;
    if (inp.capturing) return;
    if (inp.wasPressedRaw('pause')) {
      const top = this.top;
      if (top) {
        if (top.esc !== false) this.close(top);
      } else if (this.game.mode === 'play') this.game.pause();
      return;
    }
    if (inp.wasPressedRaw('tablet') && this.game.mode === 'play') {
      if (this.isOpen('tablet')) this.closeById('tablet');
      else if (this.count === 0 && this.game.sim.state.player.held.kind !== 'cash') this.openTablet();
    }
  }

  update(dt: number): void {
    for (const m of this.stack) m.update?.(dt);
  }

  // ───────── Уведомления и эффекты ─────────

  toast(text: string, kind: 'info' | 'good' | 'bad' | 'level' = 'info'): void {
    this.game.hud.toast(text, kind);
    if (kind === 'bad') this.game.audio.play('error', { vol: 0.6 });
  }

  /** Затемнение экрана (кат-сцены). */
  fade(on: boolean, ms = 600): Promise<void> {
    this.fadeEl.style.transition = `opacity ${ms}ms`;
    this.fadeEl.style.opacity = on ? '1' : '0';
    return new Promise((r) => setTimeout(r, ms));
  }

  titleCard(title: string, sub: string | null, ms = 3200): Promise<void> {
    this.titleEl?.remove();
    const el = h('div', { class: 'title-card' }, h('h1', null, title), sub ? h('div', null, sub) : null);
    el.style.opacity = '0';
    this.game.uiRoot.append(el);
    this.titleEl = el;
    requestAnimationFrame(() => (el.style.opacity = '1'));
    return new Promise((resolve) => {
      setTimeout(() => (el.style.opacity = '0'), ms);
      setTimeout(() => {
        el.remove();
        if (this.titleEl === el) this.titleEl = null;
        resolve();
      }, ms + 1000);
    });
  }

  confirm(text: string, ok = 'Да', cancel = 'Отмена'): Promise<boolean> {
    return new Promise((resolve) => {
      let done = false;
      const finish = (v: boolean) => {
        if (done) return;
        done = true;
        this.close(m);
        resolve(v);
      };
      const p = panel('Подтверждение', { icon: 'alert', onClose: () => finish(false) });
      p.panel.style.width = 'min(440px, 92vw)';
      p.body.append(
        h('div', { class: 'confirm-text' }, text),
        h(
          'div',
          { class: 'btn-row' },
          h('button', { class: 'btn outline', on: { click: () => finish(false) } }, cancel),
          h('button', { class: 'btn', on: { click: () => finish(true) } }, ok),
        ),
      );
      const m: Modal = { id: 'confirm', el: p.overlay, onClose: () => finish(false) };
      this.open(m);
    });
  }

  // ───────── Окна ─────────

  openPrice(sku: ProductId): void {
    openPrice(this, sku);
  }

  openCatalog(supplier: SupplierId, remote = false): void {
    openCatalog(this, supplier, remote);
  }

  openReport(ledger: DayLedger): void {
    openReport(this, ledger);
  }

  openDrawer(): void {
    openDrawer(this);
  }

  openTerminal(): void {
    openTerminal(this);
  }

  openTablet(tab?: TabId): void {
    this.tablet.open(tab);
  }

  say(lines: Line[], opts?: { onLine?: (i: number) => void }): Promise<void> {
    return this.dialogue.play(lines, opts);
  }

  showMainMenu(): void {
    this.menus.showMain();
  }

  hideMainMenu(): void {
    this.menus.hideMain();
  }

  showPause(): void {
    this.menus.showPause();
  }

  /** Пустой контейнер для временных элементов. */
  clearLayer(): void {
    clear(this.layer);
    this.stack = [];
  }
}
