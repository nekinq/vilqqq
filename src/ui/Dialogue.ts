import { h, setText } from './dom';
import type { UI, Modal } from './UI';

export interface Line {
  who: string | null;
  text: string;
}

/**
 * Диалоги с персонажами: плашка внизу экрана, текст печатается, клик / E / Enter / Пробел — дальше,
 * Esc — пропустить. Время в игре идёт.
 */
export class Dialogue {
  private active: { resolve: () => void; modal: Modal } | null = null;

  constructor(private readonly ui: UI) {}

  get isActive(): boolean {
    return !!this.active;
  }

  play(lines: Line[], opts: { onLine?: (i: number) => void } = {}): Promise<void> {
    if (this.active) this.finish();
    return new Promise((resolve) => {
      let i = -1;
      let shown = 0;
      let full = '';
      let timer = 0;
      const who = h('div', { class: 'who' });
      const text = h('div', { class: 'line' });
      const next = h('div', { class: 'next' }, h('span', { class: 'kbd' }, 'E'), h('span', null, 'Далее'), h('span', { class: 'dotsep' }, '•'), h('span', { class: 'kbd wide' }, 'Esc'), h('span', null, 'Пропустить'));
      const box = h('div', { class: 'dialogue' }, who, text, next);
      const overlay = h('div', { class: 'overlay clear dialogue-layer' }, box);
      const advance = () => {
        if (shown < full.length) {
          shown = full.length;
          setText(text, full);
          return;
        }
        i++;
        if (i >= lines.length) {
          this.finish();
          return;
        }
        const l = lines[i]!;
        setText(who, l.who ?? '');
        who.style.display = l.who ? '' : 'none';
        full = l.text;
        shown = 0;
        timer = 0;
        setText(text, '');
        this.ui.game.audio.play('pop', { vol: 0.4 });
        opts.onLine?.(i);
        const last = i === lines.length - 1;
        (next.children[1] as HTMLElement).textContent = last ? 'Закрыть' : 'Далее';
      };
      const onKey = (e: KeyboardEvent) => {
        if (e.code === 'KeyE' || e.code === 'Enter' || e.code === 'Space') {
          e.preventDefault();
          advance();
        }
      };
      overlay.addEventListener('mousedown', (e) => {
        e.preventDefault();
        advance();
      });
      window.addEventListener('keydown', onKey);
      const modal: Modal = {
        id: 'dialogue',
        el: overlay,
        update: (dt) => {
          if (shown < full.length) {
            timer += dt * 48;
            const n = Math.min(full.length, Math.floor(timer));
            if (n > shown) {
              shown = n;
              setText(text, full.slice(0, shown));
            }
          } else timer = shown;
        },
        onClose: () => {
          window.removeEventListener('keydown', onKey);
          const a = this.active;
          this.active = null;
          if (a) a.resolve();
        },
      };
      this.active = { resolve, modal };
      this.ui.open(modal);
      advance();
    });
  }

  /** Закрыть текущий диалог (Esc или конец реплик). */
  finish(): void {
    const a = this.active;
    if (!a) return;
    this.ui.close(a.modal);
  }
}
