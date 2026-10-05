import { h, clear } from './dom';
import { icon } from './icons';
import { panel, type UI, type Modal } from './UI';
import { ACTIONS, ACTION_LABELS, keyLabel, PRESETS, type QualityPreset, type Action } from '../core/Settings';
import { SAVE_KEYS, SLOT_LABEL, type SaveKey, type SaveMeta } from '../save/SaveManager';
import { formatClock } from '../core/math';

const PHASE_SHORT: Record<string, string> = { preparation: 'подготовка', open: 'открыто', closing: 'закрытие', report: 'итоги' };

function fmtDate(t: number): string {
  const d = new Date(t);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function fmtPlay(sec: number): string {
  const m = Math.floor(sec / 60);
  return m >= 60 ? `${Math.floor(m / 60)} ч ${m % 60} мин` : `${m} мин`;
}

/** Главное меню, пауза, настройки, сохранения. */
export class Menus {
  private main: HTMLElement | null = null;
  private pauseModal: Modal | null = null;

  constructor(private readonly ui: UI) {}

  private get game() {
    return this.ui.game;
  }

  // ───────── Главное меню ─────────

  async showMain(): Promise<void> {
    this.hideMain();
    const latest = await this.game.saves.latest();
    const box = h('div', { class: 'menu-box' }, h('h1', { class: 'menu-title' }, 'Магазин бабушки'), h('div', { class: 'menu-sub' }, 'Дубравка • деревенский магазин'));
    const btn = (label: string, ic: Parameters<typeof icon>[0], fn: () => void, cls = '') => {
      const b = h('button', { class: 'btn ' + cls }, icon(ic), label);
      b.addEventListener('click', () => {
        this.game.audio.play('click');
        fn();
      });
      box.append(b);
      return b;
    };
    if (latest) {
      btn(`Продолжить — день ${latest.day}`, 'play', () => void this.game.flow.loadGame(latest.slot));
    }
    btn('Новая игра', latest ? 'plus' : 'play', async () => {
      if (latest && !(await this.ui.confirm('Начать новую игру? Сохранения в слотах останутся.', 'Начать'))) return;
      this.game.flow.newGame({ skipIntro: false });
    }, latest ? 'outline' : '');
    btn('Загрузить', 'save', () => this.openSaves('load'), 'outline');
    btn('Настройки', 'gear', () => this.openSettings(), 'outline');
    btn('Выход', 'exit', async () => {
      if (await this.ui.confirm('Закрыть игру? В браузере можно просто закрыть вкладку.', 'Выйти')) {
        this.game.allowUnload = true;
        window.close();
        this.ui.toast('Можно закрыть вкладку браузера', 'info');
      }
    }, 'outline');
    const el = h('div', { class: 'menu' }, box, h('div', { class: 'menu-foot' }, 'WASD — ходить • E — взаимодействовать • ЛКМ/ПКМ — действия • Tab — планшет • Esc — пауза'));
    this.game.uiRoot.append(el);
    this.main = el;
  }

  hideMain(): void {
    this.main?.remove();
    this.main = null;
  }

  // ───────── Пауза ─────────

  showPause(): void {
    if (this.pauseModal) return;
    const box = h('div', { class: 'menu-box' }, h('h1', { class: 'menu-title small' }, 'Пауза'), h('div', { class: 'menu-sub' }, 'Время остановлено'));
    const btn = (label: string, ic: Parameters<typeof icon>[0], fn: () => void, cls = '') => {
      const b = h('button', { class: 'btn ' + cls }, icon(ic), label);
      b.addEventListener('click', () => {
        this.game.audio.play('click');
        fn();
      });
      box.append(b);
    };
    btn('Продолжить', 'play', () => this.resume());
    btn('Сохранить', 'save', () => this.openSaves('save'), 'outline');
    btn('Загрузить', 'save', () => this.openSaves('load'), 'outline');
    btn('Настройки', 'gear', () => this.openSettings(), 'outline');
    btn('Главное меню', 'home', async () => {
      if (await this.ui.confirm('Выйти в главное меню? Несохранённый прогресс будет потерян.', 'Выйти')) {
        this.closePause(false);
        this.game.flow.toMainMenu();
      }
    }, 'outline');
    const el = h('div', { class: 'menu pause' }, box);
    this.pauseModal = {
      id: 'pause',
      el,
      onClose: () => {
        this.pauseModal = null;
        if (this.game.mode === 'paused') this.game.resume();
      },
    };
    this.ui.open(this.pauseModal);
  }

  resume(): void {
    this.closePause(true);
  }

  closePause(resume: boolean): void {
    const m = this.pauseModal;
    if (!m) return;
    if (!resume) m.onClose = () => (this.pauseModal = null);
    this.ui.close(m);
  }

  // ───────── Сохранения ─────────

  async openSaves(mode: 'save' | 'load'): Promise<void> {
    if (this.ui.isOpen('saves')) return;
    const p = panel(mode === 'save' ? 'Сохранить игру' : 'Загрузить игру', { icon: 'save', onClose: () => this.ui.close(m) });
    p.panel.style.width = 'min(560px, 94vw)';
    const list = h('div', { class: 'list' });
    p.body.append(list);
    if (!this.game.saves.available) p.body.append(h('div', { class: 'warn' }, icon('alert'), 'Хранилище браузера недоступно (приватный режим?) — сохранения живут до закрытия вкладки.'));
    const m: Modal = { id: 'saves', el: p.overlay };
    this.ui.open(m);
    const render = async () => {
      const metas = await this.game.saves.list();
      clear(list);
      for (const key of SAVE_KEYS) {
        if (mode === 'save' && key === 'autosave') continue;
        const meta = metas[key];
        list.append(this.slotCard(key, meta, mode, render, m));
      }
    };
    await render();
  }

  private slotCard(key: SaveKey, meta: SaveMeta | undefined, mode: 'save' | 'load', rerender: () => Promise<void>, modal: Modal): HTMLElement {
    const info = meta
      ? h('div', { class: 'grow' }, h('div', { class: 't' }, `${SLOT_LABEL[key]} — день ${meta.day}, ${formatClock(meta.minutes)} (${PHASE_SHORT[meta.phase] ?? meta.phase})`), h('div', { class: 'd' }, `Баланс ${meta.money} • уровень ${meta.level} • в игре ${fmtPlay(meta.playTimeSec)} • ${fmtDate(meta.savedAt)}`))
      : h('div', { class: 'grow' }, h('div', { class: 't' }, SLOT_LABEL[key]), h('div', { class: 'd muted' }, 'Пусто'));
    const actions = h('div', { class: 'col' });
    if (mode === 'save') {
      const b = h('button', { class: 'btn small' }, icon('save'), 'Сохранить');
      b.addEventListener('click', async () => {
        if (meta && !(await this.ui.confirm(`Перезаписать «${SLOT_LABEL[key]}»?`, 'Перезаписать'))) return;
        const ok = await this.game.flow.saveTo(key);
        this.ui.toast(ok ? `Сохранено: ${SLOT_LABEL[key]}` : 'Не удалось сохранить', ok ? 'good' : 'bad');
        await rerender();
      });
      actions.append(b);
    } else if (meta) {
      const b = h('button', { class: 'btn small' }, icon('play'), 'Загрузить');
      b.addEventListener('click', async () => {
        if (this.game.mode === 'play' || this.game.mode === 'paused') {
          if (!(await this.ui.confirm('Загрузить сохранение? Текущий прогресс без сохранения будет потерян.', 'Загрузить'))) return;
        }
        this.ui.close(modal);
        await this.game.flow.loadGame(key);
      });
      actions.append(b);
    }
    if (meta) {
      const d = h('button', { class: 'btn small outline danger-text' }, 'Удалить');
      d.addEventListener('click', async () => {
        if (!(await this.ui.confirm(`Удалить «${SLOT_LABEL[key]}»?`, 'Удалить'))) return;
        await this.game.saves.remove(key);
        await rerender();
      });
      actions.append(d);
    }
    return h('div', { class: 'item slot-card' }, h('div', { class: 'ic' }, icon(key === 'autosave' ? 'clock' : 'save')), info, actions);
  }

  // ───────── Настройки ─────────

  openSettings(): void {
    if (this.ui.isOpen('settings')) return;
    const game = this.game;
    const st = game.settings;
    let tab: 'graphics' | 'audio' | 'controls' | 'general' = 'graphics';
    const p = panel('Настройки', { icon: 'gear', onClose: () => this.ui.close(m) });
    p.panel.classList.add('settings');
    const tabs = h('div', { class: 'chips' });
    const body = h('div', { class: 'settings-body' });
    p.body.append(tabs, body);
    const field = (label: string, control: HTMLElement, hint?: string) => h('div', { class: 'field' }, h('div', null, h('label', null, label), hint ? h('div', { class: 'muted small' }, hint) : null), control);
    const slider = (min: number, max: number, step: number, value: number, fmt: (v: number) => string, on: (v: number) => void) => {
      const out = h('span', { class: 'val' }, fmt(value));
      const inp = h('input', { type: 'range', min: String(min), max: String(max), step: String(step), value: String(value) }) as HTMLInputElement;
      inp.addEventListener('input', () => {
        out.textContent = fmt(Number(inp.value));
      });
      inp.addEventListener('change', () => on(Number(inp.value)));
      return h('div', { class: 'slider' }, inp, out);
    };
    const toggle = (on: boolean, set: (v: boolean) => void) => {
      const t = h('div', { class: 'toggle' + (on ? ' on' : '') }, h('i'));
      t.addEventListener('click', () => {
        const v = !t.classList.contains('on');
        t.classList.toggle('on', v);
        set(v);
        game.audio.play('click');
      });
      return t;
    };
    const select = <T extends string | number>(opts: [T, string][], value: T, set: (v: T) => void) => {
      const s = h('select') as HTMLSelectElement;
      for (const [v, l] of opts) {
        const o = h('option', { value: String(v) }, l) as HTMLOptionElement;
        if (v === value) o.selected = true;
        s.append(o);
      }
      s.addEventListener('change', () => {
        const raw = s.value;
        const found = opts.find(([v]) => String(v) === raw);
        if (found) set(found[0]);
      });
      return s;
    };
    const render = () => {
      clear(tabs);
      for (const [id, label] of [
        ['graphics', 'Графика'],
        ['audio', 'Звук'],
        ['controls', 'Мышь и клавиатура'],
        ['general', 'Общее'],
      ] as const) {
        tabs.append(
          h(
            'div',
            {
              class: 'chip' + (tab === id ? ' active' : ''),
              on: {
                click: () => {
                  tab = id;
                  render();
                },
              },
            },
            label,
          ),
        );
      }
      clear(body);
      const g = st.data.graphics;
      if (tab === 'graphics') {
        body.append(
          field(
            'Качество',
            select<QualityPreset>(
              [
                ['low', 'Низкое'],
                ['medium', 'Среднее'],
                ['high', 'Высокое'],
              ],
              g.preset,
              (v) => {
                st.applyPreset(v);
                render();
                this.ui.toast('Пресет применён. Плотность травы — после перезапуска', 'info');
              },
            ),
            'Тени, сглаживание, AO, дальность',
          ),
          field('Масштаб рендера', slider(50, 100, 5, Math.round(g.renderScale * 100), (v) => `${v}%`, (v) => st.update((s) => (s.graphics.renderScale = v / 100))), 'Меньше — быстрее, но мягче картинка'),
          field(
            'Тени',
            select(
              [
                ['off', 'Выключены'],
                ['low', 'Низкие'],
                ['high', 'Высокие (мягкие)'],
              ] as const,
              g.shadows,
              (v) => st.update((s) => (s.graphics.shadows = v)),
            ),
          ),
          field('Дальность прорисовки', slider(60, 220, 10, g.drawDistance, (v) => `${v} м`, (v) => st.update((s) => (s.graphics.drawDistance = v)))),
          field('Пост-обработка', toggle(g.postProcessing, (v) => st.update((s) => (s.graphics.postProcessing = v))), 'Ambient occlusion, свечение, цветокоррекция, резкость'),
          field(
            'Ограничение FPS',
            select<0 | 30 | 60>(
              [
                [0, 'Нет (VSync)'],
                [60, '60'],
                [30, '30'],
              ],
              g.fpsLimit,
              (v) => st.update((s) => (s.graphics.fpsLimit = v)),
            ),
          ),
          field(
            'Полный экран',
            toggle(!!document.fullscreenElement, (v) => {
              if (v) void document.documentElement.requestFullscreen?.().catch(() => undefined);
              else if (document.fullscreenElement) void document.exitFullscreen();
            }),
          ),
        );
        void PRESETS;
      } else if (tab === 'audio') {
        const a = st.data.audio;
        const pct = (v: number) => `${v}%`;
        body.append(
          field('Общая громкость', slider(0, 100, 5, Math.round(a.master * 100), pct, (v) => st.update((s) => (s.audio.master = v / 100)))),
          field('Музыка', slider(0, 100, 5, Math.round(a.music * 100), pct, (v) => st.update((s) => (s.audio.music = v / 100)))),
          field('Эффекты', slider(0, 100, 5, Math.round(a.effects * 100), pct, (v) => st.update((s) => (s.audio.effects = v / 100)))),
          field('Голоса', slider(0, 100, 5, Math.round(a.voices * 100), pct, (v) => st.update((s) => (s.audio.voices = v / 100))), 'Для будущей озвучки'),
        );
      } else if (tab === 'controls') {
        const c = st.data.controls;
        body.append(
          field('Чувствительность мыши', slider(20, 300, 5, Math.round(c.sensitivity * 100), (v) => (v / 100).toFixed(2), (v) => st.update((s) => (s.controls.sensitivity = v / 100)))),
          field('Инверсия по вертикали', toggle(c.invertY, (v) => st.update((s) => (s.controls.invertY = v)))),
          h('div', { class: 'section-title' }, 'Клавиши'),
        );
        for (const a of ACTIONS) body.append(this.bindRow(a, render));
        const reset = h('button', { class: 'btn small outline' }, 'Сбросить по умолчанию');
        reset.addEventListener('click', () => {
          st.resetBindings();
          render();
        });
        body.append(reset);
      } else {
        const gen = st.data.general;
        body.append(
          field('Автосохранение', toggle(gen.autosave, (v) => st.update((s) => (s.general.autosave = v))), 'Каждые 10 минут игры и в начале нового дня'),
          field('Показывать FPS', toggle(gen.showFps, (v) => st.update((s) => (s.general.showFps = v)))),
        );
      }
    };
    const m: Modal = {
      id: 'settings',
      el: p.overlay,
      onClose: () => game.input.cancelCapture(),
    };
    this.ui.open(m);
    render();
  }

  private bindRow(a: Action, rerender: () => void): HTMLElement {
    const st = this.game.settings;
    const codes = st.data.controls.bindings[a] ?? [];
    const b = h('button', { class: 'bind' }, codes.length ? codes.map(keyLabel).join(' / ') : '—');
    b.addEventListener('click', () => {
      b.classList.add('wait');
      b.textContent = 'Нажмите клавишу…';
      this.game.input.captureNext((code) => {
        if (code === 'Escape' && a !== 'pause') {
          rerender();
          return;
        }
        const conflicts = this.game.input.actionsForCode(code).filter((x) => x !== a);
        st.update((s) => {
          for (const c of conflicts) s.controls.bindings[c] = s.controls.bindings[c].filter((k) => k !== code);
          s.controls.bindings[a] = [code];
        });
        if (conflicts.length) this.ui.toast(`Клавиша ${keyLabel(code)} снята с: ${conflicts.map((c) => ACTION_LABELS[c]).join(', ')}`, 'info');
        rerender();
      });
    });
    return h('div', { class: 'field' }, h('label', null, ACTION_LABELS[a]), b);
  }
}
