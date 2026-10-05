import { h, clear, setText } from './dom';
import { icon, type IconName } from './icons';
import type { UI, Modal } from './UI';
import { formatClock } from '../core/math';
import { FURNITURE, FURNITURE_ORDER, type FurnitureType } from '../data/equipment';
import { LICENSES, LICENSE_ORDER } from '../data/licenses';
import { SUPPLIERS, SUPPLIER_ORDER } from '../data/suppliers';
import { PRODUCTS } from '../data/products';
import { LEVELS, STAFF, GOAL, MAX_LEVEL } from '../data/progression';
import { ledgerProfit } from '../economy/Economy';
import type { Phase } from '../game/state';

export type TabId = 'summary' | 'growth' | 'equipment' | 'staff' | 'suppliers';

const TABS: { id: TabId; title: string; icon: IconName }[] = [
  { id: 'summary', title: 'Сводка', icon: 'home' },
  { id: 'growth', title: 'Развитие', icon: 'chart' },
  { id: 'equipment', title: 'Оборудование', icon: 'shelf' },
  { id: 'staff', title: 'Сотрудники', icon: 'people' },
  { id: 'suppliers', title: 'Поставщики', icon: 'truck' },
];

const PHASE: Record<Phase, string> = { preparation: 'Подготовка', open: 'Открыто', closing: 'Закрытие', report: 'Итоги' };

const FURN_ICON: Record<FurnitureType, IconName> = { shelf: 'shelf', storage_rack: 'box', fridge: 'milk', freezer: 'meat' };

/** Планшет (Tab): пять вкладок, время не останавливается. */
export class Tablet {
  private tab: TabId = 'summary';
  private body!: HTMLElement;
  private tabsEl!: HTMLElement;
  private clock!: HTMLElement;
  private modal: Modal | null = null;
  private dirty = true;
  private unsub: (() => void)[] = [];
  private tick = 0;

  constructor(private readonly ui: UI) {}

  private get sim() {
    return this.ui.sim;
  }

  open(tab?: TabId): void {
    if (this.modal) {
      if (tab) this.select(tab);
      return;
    }
    if (tab) this.tab = tab;
    this.tabsEl = h('div', { class: 'tabs' });
    this.body = h('div', { class: 'tab-body' });
    this.clock = h('span', { class: 'tablet-clock' });
    const close = h('button', { class: 'tablet-close', title: 'Закрыть (Tab)' }, icon('close'));
    close.addEventListener('click', () => this.close());
    const screen = h(
      'div',
      { class: 'tablet-screen' },
      h('div', { class: 'tablet-bar' }, h('span', { class: 'title-serif' }, 'Магазин бабушки'), this.clock, close),
      this.tabsEl,
      this.body,
      h('div', { class: 'tab-foot hint' }, icon('info'), 'Планшет и каталог не останавливают время'),
    );
    const wrap = h('div', { class: 'tablet-wrap' }, h('div', { class: 'tablet' }, screen));
    wrap.addEventListener('mousedown', (e) => {
      if (e.target === wrap) this.close();
    });
    const ev = this.sim.events;
    const mark = () => (this.dirty = true);
    this.unsub = [
      ev.on('money', mark),
      ev.on('phase', mark),
      ev.on('xp', mark),
      ev.on('reputation', mark),
      ev.on('furniture', mark),
      ev.on('furniturePending', mark),
      ev.on('license', mark),
      ev.on('staff', mark),
      ev.on('supplierMet', mark),
      ev.on('restoration', mark),
      ev.on('section', mark),
    ];
    this.modal = {
      id: 'tablet',
      el: wrap,
      update: (dt) => this.update(dt),
      onClose: () => {
        for (const u of this.unsub) u();
        this.unsub = [];
        this.modal = null;
        this.ui.game.tabletOpen = false;
      },
    };
    this.ui.game.tabletOpen = true;
    this.ui.open(this.modal);
    this.ui.game.audio.play('pop');
    this.renderTabs();
    this.render();
  }

  close(): void {
    if (this.modal) this.ui.close(this.modal);
  }

  get isOpen(): boolean {
    return !!this.modal;
  }

  select(tab: TabId): void {
    this.tab = tab;
    this.renderTabs();
    this.render();
  }

  private renderTabs(): void {
    clear(this.tabsEl);
    for (const t of TABS) {
      this.tabsEl.append(
        h(
          'div',
          {
            class: 'tab' + (t.id === this.tab ? ' active' : ''),
            on: {
              click: () => {
                this.ui.game.audio.play('click');
                this.select(t.id);
              },
            },
          },
          icon(t.icon),
          t.title,
        ),
      );
    }
  }

  private update(dt: number): void {
    this.tick -= dt;
    if (this.tick <= 0) {
      this.tick = 0.25;
      const s = this.sim.state;
      setText(this.clock, `День ${s.day} • ${PHASE[s.phase]} • ${formatClock(s.minutes)}`);
    }
    if (this.dirty) this.render();
  }

  private render(): void {
    this.dirty = false;
    const scroll = this.body.scrollTop;
    clear(this.body);
    switch (this.tab) {
      case 'summary':
        this.summary();
        break;
      case 'growth':
        this.growth();
        break;
      case 'equipment':
        this.equipment();
        break;
      case 'staff':
        this.staff();
        break;
      case 'suppliers':
        this.suppliers();
        break;
    }
    this.body.scrollTop = scroll;
  }

  // ───────── Вкладки ─────────

  private statCard(ic: IconName, k: string, v: string, sub?: string, progress?: number): HTMLElement {
    return h('div', { class: 'stat' }, icon(ic), h('div', { class: 'grow' }, h('div', { class: 'k' }, k), h('div', { class: 'v' }, v), sub ? h('div', { class: 's' }, sub) : null, progress !== undefined ? h('div', { class: 'progress' }, h('i', { style: { width: `${Math.round(progress * 100)}%` } })) : null));
  }

  private summary(): void {
    const sim = this.sim;
    const s = sim.state;
    const pr = sim.progression.progress();
    this.body.append(
      h(
        'div',
        { class: 'grid2' },
        this.statCard('wallet', 'Баланс', String(s.money)),
        this.statCard('star', `Уровень ${s.level}`, pr.next === null ? 'Максимум' : `${s.xp} / ${pr.next} XP`, undefined, pr.t),
        this.statCard('thumb', 'Репутация', String(Math.round(s.reputation)), s.reputation >= 70 ? 'Вас любят в деревне' : s.reputation >= 40 ? 'Неплохо' : 'Покупатели недовольны'),
        this.statCard('sparkle', 'Чистота', `${Math.round(sim.dirt.cleanliness())}%`, sim.dirt.cleanliness() < 60 ? 'Пора взять метлу (клавиша 2)' : 'Чисто и уютно'),
      ),
    );
    // Смена.
    const shift = h('div', { class: 'card shift' });
    if (s.phase === 'preparation') {
      const blockers = sim.openBlockers();
      const warnings = sim.openWarnings();
      const btn = h('button', { class: 'btn block' }, icon('door'), 'Открыть смену') as HTMLButtonElement;
      btn.disabled = blockers.length > 0;
      btn.addEventListener('click', () => {
        if (this.ui.game.flow.openShift()) this.close();
      });
      shift.append(
        h('div', { class: 'section-title' }, 'Смена 08:00 – 23:00'),
        h('div', { class: 'muted' }, 'Пока смена не открыта, часы стоят — можно спокойно готовиться.'),
        ...blockers.map((b) => h('div', { class: 'lock-reason' }, icon('lock'), b)),
        ...warnings.map((w) => h('div', { class: 'warn' }, icon('alert'), w)),
        btn,
      );
    } else if (s.phase === 'open') {
      const btn = h('button', { class: 'btn block outline' }, icon('door'), 'Закрыть смену');
      btn.addEventListener('click', async () => {
        const ok = await this.ui.confirm('Закрыть магазин раньше? Новые покупатели не придут, тех, кто внутри, нужно обслужить.', 'Закрыть', 'Отмена');
        if (ok) this.ui.game.flow.closeShift();
      });
      shift.append(h('div', { class: 'section-title' }, 'Магазин открыт'), h('div', { class: 'muted' }, `Покупателей сегодня: ${s.ledger.customersVisited} • Обслужено: ${s.ledger.customersServed}`), btn);
    } else if (s.phase === 'closing') {
      shift.append(h('div', { class: 'section-title' }, 'Закрытие'), h('div', { class: 'muted' }, 'Новые покупатели не приходят. Обслужите тех, кто в магазине — после этого будет итог дня.'));
    } else {
      shift.append(h('div', { class: 'section-title' }, 'День окончен'), h('div', { class: 'muted' }, 'Посмотрите итог дня.'));
    }
    this.body.append(shift);
    const goal = this.ui.game.flow.objectiveText();
    if (goal) this.body.append(h('div', { class: 'card objective' }, h('span', { class: 'obj-ic' }, '!'), goal));
    // История дней.
    if (s.history.length) {
      const rows = s.history.slice(-7).reverse();
      this.body.append(
        h('div', { class: 'section-title' }, 'История'),
        h(
          'table',
          { class: 'table' },
          h('tr', null, h('th', null, 'День'), h('th', null, 'Выручка'), h('th', null, 'Прибыль'), h('th', null, 'Покупатели'), h('th', null, 'Репутация')),
          ...rows.map((l) => {
            const p = ledgerProfit(l);
            return h('tr', null, h('td', null, String(l.day)), h('td', null, String(l.revenue)), h('td', { class: p >= 0 ? 'pos' : 'neg' }, (p > 0 ? '+' : '') + p), h('td', null, `${l.customersServed}/${l.customersVisited}`), h('td', null, String(Math.round(l.reputationEnd))));
          }),
        ),
      );
    }
  }

  private growth(): void {
    const sim = this.sim;
    const s = sim.state;
    const pr = sim.progression.progress();
    this.body.append(
      h('div', { class: 'card' }, h('div', { class: 'row-between' }, h('b', null, `Уровень ${s.level}`), h('span', { class: 'muted' }, pr.next === null ? 'максимальный' : `${s.xp} / ${pr.next} XP`)), h('div', { class: 'progress' }, h('i', { style: { width: `${Math.round(pr.t * 100)}%` } })), h('div', { class: 'muted small' }, 'Опыт: полная покупка +10, частичная +6, чистота ≥ 90% +1.')),
    );
    if (s.level < MAX_LEVEL) {
      const nx = LEVELS[s.level]!;
      const unlocks: string[] = [];
      for (const f of FURNITURE_ORDER) if (FURNITURE[f].level === nx.level) unlocks.push(FURNITURE[f].title.toLowerCase());
      for (const l of LICENSE_ORDER) if (LICENSES[l].level === nx.level) unlocks.push(`лицензия «${LICENSES[l].title}»`);
      if (STAFF.cashier.level === nx.level) unlocks.push('кассир');
      if (nx.level === 4) unlocks.push('заказ по планшету');
      this.body.append(h('div', { class: 'hint left' }, icon('star'), `Уровень ${nx.level}: ${unlocks.join(', ') || 'больше покупателей'} • покупателей ${nx.customers[0]}–${nx.customers[1]}`));
    }
    this.body.append(h('div', { class: 'section-title' }, 'Лицензии'));
    const list = h('div', { class: 'list' });
    for (const id of LICENSE_ORDER) {
      const d = LICENSES[id];
      const has = sim.progression.hasLicense(id);
      const blockers = sim.progression.licenseBlockers(id);
      const right = has
        ? h('span', { class: 'owned' }, icon('check'), 'Оформлена')
        : (() => {
            const b = h('button', { class: 'btn small' }, `Купить · ${d.price}`) as HTMLButtonElement;
            b.disabled = blockers.length > 0;
            b.title = blockers.join('\n');
            b.addEventListener('click', () => {
              if (sim.progression.buyLicense(id, sim.economy)) this.ui.game.audio.play('success');
            });
            return b;
          })();
      list.append(h('div', { class: 'item' + (has ? ' done' : '') }, h('div', { class: 'ic' }, icon(has ? 'check' : 'lock')), h('div', { class: 'grow' }, h('div', { class: 't' }, d.title), h('div', { class: 'd' }, `${d.unlocks} • с уровня ${d.level}`), !has && blockers.length ? h('div', { class: 'd neg' }, blockers[0]!) : null), right));
    }
    this.body.append(list);
    const st = s.story.ending;
    this.body.append(
      h('div', { class: 'section-title' }, 'Мечта бабушки'),
      h('div', { class: 'card' }, st.done ? 'Магазин снова полон жизни! Бабушка гордится вами.' : `Уровень ${GOAL.level} и репутация ${GOAL.reputation}+ в конце дня ${GOAL.streakDays} дня подряд. Серия: ${st.streak}/${GOAL.streakDays}.`),
    );
  }

  private equipment(): void {
    const sim = this.sim;
    const s = sim.state;
    const game = this.ui.game;
    if (s.pendingFurniture.length) {
      this.body.append(h('div', { class: 'section-title' }, 'Купленное — поставьте в магазине'));
      const list = h('div', { class: 'list' });
      const counts = new Map<FurnitureType, number>();
      for (const t of s.pendingFurniture) counts.set(t, (counts.get(t) ?? 0) + 1);
      for (const [t, n] of counts) {
        const b = h('button', { class: 'btn small gold' }, icon('shelf'), 'Поставить');
        b.addEventListener('click', () => {
          this.close();
          game.stock.startPlacement(t);
        });
        list.append(h('div', { class: 'item' }, h('div', { class: 'ic' }, icon(FURN_ICON[t])), h('div', { class: 'grow' }, h('div', { class: 't' }, `${FURNITURE[t].title}${n > 1 ? ` × ${n}` : ''}`), h('div', { class: 'd' }, 'ЛКМ — поставить, R — повернуть, ПКМ — отмена')), b));
      }
      this.body.append(list);
    }
    this.body.append(h('div', { class: 'section-title' }, 'Каталог оборудования'));
    const list = h('div', { class: 'list' });
    for (const t of FURNITURE_ORDER) {
      const d = FURNITURE[t];
      const blockers = sim.equipment.buyBlockers(t);
      const b = h('button', { class: 'btn small' }, `Купить · ${d.price}`) as HTMLButtonElement;
      b.disabled = blockers.length > 0;
      b.title = blockers.join('\n');
      b.addEventListener('click', () => {
        if (sim.equipment.buy(t)) {
          game.audio.play('cash');
          if (t === 'shelf') s.tutorial.shelfBought = true;
        }
      });
      list.append(h('div', { class: 'item' }, h('div', { class: 'ic' }, icon(FURN_ICON[t])), h('div', { class: 'grow' }, h('div', { class: 't' }, `${d.title} `, h('span', { class: 'muted' }, `${sim.equipment.count(t)}/${d.max}`)), h('div', { class: 'd' }, d.description), blockers.length ? h('div', { class: 'd neg' }, blockers[0]!) : null), b));
    }
    this.body.append(list);
    if (s.furniture.length) {
      this.body.append(h('div', { class: 'section-title' }, 'Установлено'));
      const inst = h('div', { class: 'list' });
      for (const f of s.furniture) {
        const b = h('button', { class: 'btn small outline' }, 'Переставить');
        b.addEventListener('click', () => {
          this.close();
          game.stock.startPlacement(f.type, f.id);
        });
        const stocked = Object.entries(s.sections).filter(([k, sec]) => k.startsWith(`${f.id}#`) && sec.count > 0).length;
        inst.append(h('div', { class: 'item' }, h('div', { class: 'ic' }, icon(FURN_ICON[f.type])), h('div', { class: 'grow' }, h('div', { class: 't' }, FURNITURE[f.type].title), h('div', { class: 'd' }, FURNITURE[f.type].sections ? `Секций с товаром: ${stocked}/${FURNITURE[f.type].sections}` : `Мест для коробок: ${FURNITURE[f.type].boxSlots}`)), b));
      }
      this.body.append(inst);
    }
  }

  private staff(): void {
    const sim = this.sim;
    const s = sim.state;
    const blockers = sim.equipment.cashierBlockers();
    const card = h('div', { class: 'item big' }, h('div', { class: 'ic' }, icon('people')));
    const info = h(
      'div',
      { class: 'grow' },
      h('div', { class: 't' }, 'Кассир'),
      h('div', { class: 'd' }, `С уровня ${STAFF.cashier.level} • найм ${STAFF.cashier.hireFee} • зарплата ${STAFF.cashier.wage} за смену`),
      h('div', { class: 'd' }, 'Сам пробивает очередь и принимает оплату. Не убирает, не раскладывает товар и не ходит к поставщикам. Если вы начали продажу сами — не перехватывает её.'),
    );
    card.append(info);
    if (s.cashierHired) {
      const b = h('button', { class: 'btn small outline' }, 'Уволить') as HTMLButtonElement;
      b.disabled = s.phase !== 'preparation';
      b.title = s.phase !== 'preparation' ? 'Только во время подготовки' : '';
      b.addEventListener('click', async () => {
        if (await this.ui.confirm('Уволить кассира? Плата за найм не возвращается.', 'Уволить')) sim.equipment.fireCashier();
      });
      card.append(h('div', { class: 'col' }, h('span', { class: 'owned' }, icon('check'), 'Работает'), b));
    } else {
      const b = h('button', { class: 'btn small' }, `Нанять · ${STAFF.cashier.hireFee}`) as HTMLButtonElement;
      b.disabled = blockers.length > 0;
      b.addEventListener('click', () => {
        if (sim.equipment.hireCashier()) this.ui.game.audio.play('success');
      });
      card.append(h('div', { class: 'col' }, b, blockers.length ? h('div', { class: 'd neg' }, blockers[0]!) : null));
    }
    this.body.append(card);
  }

  private suppliers(): void {
    const sim = this.sim;
    const s = sim.state;
    const remote = sim.orders.remoteBlockers();
    const rb = h('div', { class: 'card remote' });
    if (remote.length) {
      rb.append(h('div', { class: 'lock-reason' }, icon('lock'), `Заказ по планшету: уровень 4 + знакомство ${s.suppliersMet.length}/5`), ...remote.map((r) => h('div', { class: 'd muted' }, r)));
    } else {
      const b = h('button', { class: 'btn' }, icon('cart'), 'Открыть каталог');
      b.addEventListener('click', () => {
        this.ui.openCatalog(s.suppliersMet[0] ?? 'grocery', true);
      });
      rb.append(h('div', { class: 'section-title' }, 'Заказ по планшету'), h('div', { class: 'muted' }, 'Те же цены, доставка к навесу.'), b);
    }
    this.body.append(rb);
    const list = h('div', { class: 'list' });
    for (const id of SUPPLIER_ORDER) {
      const d = SUPPLIERS[id];
      const met = s.suppliersMet.includes(id);
      const prods = h('div', { class: 'prod-chips' });
      for (const p of d.products) {
        const av = sim.orders.availability(p);
        prods.append(h('span', { class: 'pchip' + (av.ok ? '' : ' locked'), title: av.reasons.join('\n') }, av.ok ? null : icon('lock'), PRODUCTS[p].name));
      }
      list.append(h('div', { class: 'item' }, h('div', { class: 'ic' }, icon(met ? 'check' : 'store')), h('div', { class: 'grow' }, h('div', { class: 't' }, `${d.title} `, h('span', { class: 'muted' }, `— ${d.vendorName}`)), h('div', { class: 'd' }, met ? 'Знакомы. Заказывать можно у прилавка.' : `Не знакомы. ${d.where}`), prods)));
    }
    this.body.append(list);
  }
}
