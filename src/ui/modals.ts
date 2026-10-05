import { h, clear, setText } from './dom';
import { icon } from './icons';
import { panel, type UI, type Modal } from './UI';
import { PRODUCTS, boxPrice, STORAGE_LABEL, type ProductId, type SupplierId } from '../data/products';
import { SUPPLIERS, SUPPLIER_ORDER } from '../data/suppliers';
import { BALANCE, DENOMINATIONS } from '../data/balance';
import type { DayLedger } from '../game/state';
import { ledgerProfit, ledgerCashFlow } from '../economy/Economy';
import { checkoutTotal, changeDue, changeSelected } from '../checkout/Checkout';
import { signed } from '../core/math';

// ───────── Цена продажи ─────────

export function openPrice(ui: UI, sku: ProductId): void {
  if (ui.isOpen('price')) ui.closeById('price');
  const sim = ui.sim;
  const p = PRODUCTS[sku];
  sim.state.tutorial.priceChecked = true;
  const pp = panel('Цена продажи', { icon: 'coin', onClose: () => ui.close(m) });
  pp.panel.style.width = 'min(460px, 92vw)';
  const input = h('input', { class: 'price-input', type: 'text', inputmode: 'numeric', maxlength: '4', value: String(sim.price(sku)) }) as HTMLInputElement;
  const markup = h('div', { class: 'markup' });
  const save = h('button', { class: 'btn' }, icon('check'), 'Сохранить');
  const err = h('div', { class: 'lock-reason' });
  const parse = (): number | null => {
    const v = Number(input.value.trim());
    if (!Number.isInteger(v) || v < BALANCE.priceMin || v > BALANCE.priceMax) return null;
    return v;
  };
  const refresh = () => {
    const v = parse();
    clear(markup);
    err.textContent = '';
    if (v === null) {
      err.append(icon('alert'), `Цена — целое число от ${BALANCE.priceMin} до ${BALANCE.priceMax}`);
      (save as HTMLButtonElement).disabled = true;
      return;
    }
    (save as HTMLButtonElement).disabled = false;
    const d = v - p.wholesalePrice;
    const pct = Math.round((d / p.wholesalePrice) * 100);
    markup.append(h('span', null, 'Наценка '), h('b', { class: d >= 0 ? 'pos' : 'neg' }, signed(d)), h('span', { class: 'dotsep' }, '•'), h('b', { class: d >= 0 ? 'pos' : 'neg' }, `${pct >= 0 ? '+' : ''}${pct}%`));
  };
  const step = (k: number) => {
    const v = parse() ?? sim.price(sku);
    input.value = String(Math.min(BALANCE.priceMax, Math.max(BALANCE.priceMin, v + k)));
    refresh();
    ui.game.audio.play('click');
  };
  const doSave = () => {
    const v = parse();
    if (v === null) return;
    if (sim.setPrice(sku, v)) {
      ui.toast(`Цена: ${p.name} — ${v}`, 'good');
      ui.game.audio.play('coin');
      ui.close(m);
    }
  };
  input.addEventListener('input', () => {
    input.value = input.value.replace(/[^0-9]/g, '').slice(0, 4);
    refresh();
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doSave();
    if (e.key === 'ArrowUp') step(1);
    if (e.key === 'ArrowDown') step(-1);
  });
  save.addEventListener('click', doSave);
  pp.body.append(
    h(
      'div',
      { class: 'prod-row' },
      h('div', { class: 'product-pic' }, ui.icons.img(`prod_${sku}`, p.name)),
      h(
        'div',
        { class: 'rows grow' },
        h('div', { class: 'r head' }, h('span', null, p.name), h('span', { class: 'muted' }, STORAGE_LABEL[p.storage])),
        h('div', { class: 'r' }, h('span', null, 'Закупка за единицу'), h('b', null, String(p.wholesalePrice))),
        h('div', { class: 'r' }, h('span', null, 'Текущая цена'), h('b', null, String(sim.price(sku)))),
      ),
    ),
    h('div', { class: 'section-title' }, 'Новая цена'),
    h('div', { class: 'stepper big' }, h('button', { on: { click: () => step(-1) } }, icon('minus')), input, h('button', { on: { click: () => step(1) } }, icon('plus'))),
    markup,
    err,
    h('div', { class: 'btn-row' }, h('button', { class: 'btn outline', on: { click: () => ui.close(m) } }, 'Закрыть'), save),
  );
  const m: Modal = { id: 'price', el: pp.overlay };
  ui.open(m);
  refresh();
  setTimeout(() => {
    input.focus();
    input.select();
  }, 30);
}

// ───────── Каталог поставщика ─────────

export function openCatalog(ui: UI, supplier: SupplierId, remote = false): void {
  if (ui.isOpen('catalog')) ui.closeById('catalog');
  const sim = ui.sim;
  let sup: SupplierId = supplier;
  let sel: ProductId = SUPPLIERS[sup].products[0]!;
  let qty = 1;
  const pp = panel(remote ? 'Заказ по планшету' : `Поставщик: ${SUPPLIERS[sup].title}`, { icon: 'truck', onClose: () => ui.close(m) });
  pp.panel.style.width = 'min(560px, 94vw)';
  const supChips = h('div', { class: 'chips' });
  const chips = h('div', { class: 'chips' });
  const card = h('div', { class: 'catalog-card' });
  const buyRow = h('div', { class: 'buy-row' });
  const foot = h('div', { class: 'hint' });
  const render = () => {
    const title = pp.head.querySelector('.ph-title');
    if (title && !remote) title.lastChild!.textContent = `Поставщик: ${SUPPLIERS[sup].title}`;
    clear(supChips);
    if (remote) {
      for (const id of SUPPLIER_ORDER) {
        supChips.append(
          h(
            'div',
            {
              class: 'chip' + (id === sup ? ' active' : ''),
              on: {
                click: () => {
                  sup = id;
                  sel = SUPPLIERS[id].products[0]!;
                  qty = 1;
                  render();
                },
              },
            },
            SUPPLIERS[id].title,
          ),
        );
      }
    }
    clear(chips);
    for (const id of SUPPLIERS[sup].products) {
      const av = sim.orders.availability(id);
      chips.append(
        h(
          'div',
          {
            class: 'chip' + (id === sel ? ' active' : '') + (av.ok ? '' : ' locked'),
            on: {
              click: () => {
                sel = id;
                qty = 1;
                render();
                ui.game.audio.play('click');
              },
            },
          },
          av.ok ? null : icon('lock'),
          PRODUCTS[id].name,
        ),
      );
    }
    const p = PRODUCTS[sel];
    const av = sim.orders.availability(sel);
    const unit = boxPrice(sel);
    clear(card);
    card.append(
      h('div', { class: 'product-pic' }, ui.icons.img(`prod_${sel}`, p.name)),
      h(
        'div',
        { class: 'rows grow' },
        h('div', { class: 'r head' }, h('span', null, p.name), h('span', { class: 'muted' }, STORAGE_LABEL[p.storage])),
        h('div', { class: 'r' }, h('span', null, 'Коробка'), h('b', null, `${p.boxSize} шт.`)),
        h('div', { class: 'r' }, h('span', null, 'Закупка'), h('b', null, `${p.wholesalePrice} за единицу`)),
        h('div', { class: 'r' }, h('span', null, 'Цена коробки'), h('b', null, String(unit))),
      ),
    );
    clear(buyRow);
    const free = sim.inventory.freeDeliverySlots().length;
    if (!av.ok) {
      buyRow.append(h('div', { class: 'lock-list' }, ...av.reasons.map((r) => h('div', { class: 'lock-reason' }, icon('lock'), r))));
    } else {
      const total = unit * qty;
      const val = h('div', { class: 'val' }, String(qty));
      const btn = h('button', { class: 'btn' }, icon('cart'), 'Купить') as HTMLButtonElement;
      const problems: string[] = [];
      if (sim.state.money < total) problems.push(`Не хватает ${total - sim.state.money} монет`);
      if (free < qty) problems.push(free === 0 ? 'Зона доставки заполнена (12/12)' : `В зоне доставки свободно ${free} из 12`);
      if (remote && sim.orders.remoteBlockers().length) problems.push(...sim.orders.remoteBlockers());
      btn.disabled = problems.length > 0;
      btn.addEventListener('click', () => {
        const r = sim.orders.order(sel, qty, remote);
        if (r.ok) {
          ui.toast(`Заказано: ${PRODUCTS[sel].name} × ${qty} кор. — ${r.total}`, 'good');
          ui.game.audio.play('cash');
          if (!sim.state.tutorial.orders.includes(sel)) sim.state.tutorial.orders.push(sel);
          qty = 1;
          render();
        } else ui.toast(r.reason, 'bad');
      });
      buyRow.append(
        h(
          'div',
          { class: 'buy-line' },
          h('span', { class: 'lbl' }, 'Коробок'),
          h(
            'div',
            { class: 'stepper' },
            h('button', { on: { click: () => ((qty = Math.max(1, qty - 1)), render()) } }, icon('minus')),
            val,
            h('button', { on: { click: () => ((qty = Math.min(12, qty + 1)), render()) } }, icon('plus')),
          ),
          h('span', { class: 'grow' }),
          h('span', { class: 'lbl' }, 'Итого'),
          h('b', { class: 'total' }, String(total)),
        ),
        ...problems.map((r) => h('div', { class: 'lock-reason' }, icon('alert'), r)),
        btn,
      );
    }
    clear(foot);
    foot.append(icon('truck'), `Доставка включена — коробки появятся под навесом у склада. Свободно мест: ${free}/12 • Баланс: ${sim.state.money}`);
  };
  pp.body.append(remote ? supChips : '', chips, card, buyRow, foot);
  const unsub = sim.events.on('money', () => render());
  const m: Modal = { id: 'catalog', el: pp.overlay, onClose: () => unsub() };
  ui.open(m);
  render();
}

// ───────── Итог дня ─────────

export function openReport(ui: UI, L: DayLedger): void {
  if (ui.isOpen('report')) return;
  const sim = ui.sim;
  const token = sim.state.dayToken;
  const pp = panel(`День ${L.day} • Итог`, { icon: 'chart' });
  pp.panel.classList.add('report');
  pp.head.querySelector('.x')?.remove();
  const profit = ledgerProfit(L);
  const flow = ledgerCashFlow(L);
  const row = (k: string, v: number, cls = '', neg = false) => h('div', { class: 'r' + cls }, h('span', null, k), h('b', { class: v === 0 ? '' : neg || v < 0 ? 'neg' : 'pos' }, neg && v !== 0 ? `−${v}` : v > 0 && cls ? `+${v}` : String(v)));
  const btn = h('button', { class: 'btn block gold' }, icon('play'), 'Начать новый день') as HTMLButtonElement;
  btn.addEventListener('click', () => {
    if (btn.disabled) return;
    btn.disabled = true;
    ui.game.flow.startNewDay(token);
  });
  const repD = L.reputationEnd - L.reputationStart;
  pp.body.append(
    h(
      'div',
      { class: 'grid2' },
      h(
        'div',
        { class: 'rows' },
        h('div', { class: 'r head' }, 'Финансовый результат'),
        row('Выручка', L.revenue),
        row('Себестоимость', L.costOfGoodsSold, '', true),
        row('Зарплата', L.wages, '', true),
        h('div', { class: 'r hl' + (profit < 0 ? ' neg' : '') }, h('span', null, 'Прибыль'), h('b', { class: profit >= 0 ? 'pos' : 'neg' }, signed(profit))),
      ),
      h(
        'div',
        { class: 'rows' },
        h('div', { class: 'r head' }, 'Движение денег'),
        row('Закупки товара', L.productPurchases, '', true),
        row('Оборудование', L.equipmentPurchases, '', true),
        row('Лицензии', L.licensePurchases, '', true),
        row('Найм', L.hireFees, '', true),
        h('div', { class: 'r hl' + (flow < 0 ? ' neg' : '') }, h('span', null, 'Изменение баланса'), h('b', { class: flow >= 0 ? 'pos' : 'neg' }, signed(flow))),
      ),
    ),
    h('div', { class: 'balance-line' }, icon('wallet'), 'Баланс', h('b', null, String(L.openingBalance)), '→', h('b', { class: L.closingBalance >= L.openingBalance ? 'pos' : 'neg' }, String(L.closingBalance))),
    h(
      'div',
      { class: 'report-stats' },
      stat('people', 'Покупатели', `${L.customersServed}/${L.customersVisited}`),
      stat('cart', 'Продано', String(L.itemsSold)),
      stat('star', 'Опыт', `+${L.xp}`),
      stat('thumb', 'Репутация', `${Math.round(L.reputationEnd)} (${repD >= 0 ? '+' : '−'}${Math.abs(repD).toFixed(1)})`),
      stat('sparkle', 'Чистота', `${L.cleanlinessEnd}%`),
    ),
    btn,
  );
  const m: Modal = { id: 'report', el: pp.overlay, esc: false };
  ui.open(m);
}

function stat(ic: Parameters<typeof icon>[0], k: string, v: string): HTMLElement {
  return h('div', { class: 'mini-stat' }, icon(ic), h('div', null, h('div', { class: 'k' }, k), h('div', { class: 'v' }, v)));
}

// ───────── Касса: денежный ящик ─────────

export function openDrawer(ui: UI): void {
  if (ui.isOpen('drawer')) return;
  const game = ui.game;
  const s0 = game.sim.state.checkout;
  if (!s0) return;
  const pp = panel('Денежный ящик', { icon: 'cash', onClose: () => ui.close(m) });
  pp.panel.classList.add('drawer');
  const info = h('div', { class: 'drawer-info' });
  const tray = h('div', { class: 'tray' });
  const status = h('div', { class: 'drawer-status' });
  const give = h('button', { class: 'btn' }, icon('check'), 'Выдать сдачу') as HTMLButtonElement;
  const reset = h('button', { class: 'btn outline' }, 'Сбросить');
  const denoms = h('div', { class: 'denoms' });
  for (const d of [...DENOMINATIONS].reverse()) {
    const coin = d <= 10;
    denoms.append(
      h(
        'div',
        {
          class: `denom ${coin ? 'coin' : 'note'}`,
          on: {
            click: () => {
              const c = game.sim.state.checkout;
              if (!c) return;
              c.change.push(d);
              game.audio.play(coin ? 'coin' : 'cash');
              render();
            },
          },
        },
        String(d),
      ),
    );
  }
  const render = () => {
    const c = game.sim.state.checkout;
    if (!c) {
      ui.close(m);
      return;
    }
    const need = changeDue(c);
    const selected = changeSelected(c);
    clear(info);
    info.append(
      h('div', null, h('span', { class: 'k' }, 'Получено'), h('b', null, String(c.cashGiven))),
      h('div', null, h('span', { class: 'k' }, 'Итого'), h('b', null, String(checkoutTotal(c)))),
      h('div', null, h('span', { class: 'k' }, 'Сдача'), h('b', { class: 'gold' }, String(need))),
    );
    clear(tray);
    if (c.change.length === 0) tray.append(h('em', { class: 'muted' }, need > 0 ? 'Нажимайте на номиналы, чтобы собрать сдачу' : 'Сдача не нужна'));
    c.change.forEach((v, i) =>
      tray.append(
        h(
          'span',
          {
            title: 'Убрать',
            on: {
              click: () => {
                c.change.splice(i, 1);
                game.audio.play('click');
                render();
              },
            },
          },
          String(v),
        ),
      ),
    );
    clear(status);
    status.append(h('span', null, 'Нужно: ', h('b', null, String(need))), h('span', { class: 'dotsep' }, '•'), h('span', null, 'Выбрано: ', h('b', { class: selected === need ? 'pos' : selected > need ? 'neg' : '' }, String(selected))));
    give.disabled = selected !== need;
    setText(give.lastChild as unknown as HTMLElement, need === 0 ? 'Закрыть ящик' : 'Выдать сдачу');
    game.hud.setCash({ given: c.cashGiven, change: need });
  };
  give.addEventListener('click', () => {
    if (game.counter.giveChange()) ui.close(m);
    else render();
  });
  reset.addEventListener('click', () => {
    const c = game.sim.state.checkout;
    if (c) c.change.length = 0;
    render();
  });
  pp.body.append(info, denoms, h('div', { class: 'section-title' }, 'Лоток сдачи'), tray, status, h('div', { class: 'btn-row' }, reset, give));
  const m: Modal = {
    id: 'drawer',
    el: pp.overlay,
    onClose: () => game.counter.drawerClosed(),
  };
  game.counter.drawerOpened();
  ui.open(m);
  render();
}

// ───────── Касса: терминал ─────────

export function openTerminal(ui: UI): void {
  if (ui.isOpen('terminal')) return;
  const game = ui.game;
  const c = game.sim.state.checkout;
  if (!c) return;
  const pp = panel('Терминал', { icon: 'card', onClose: () => ui.close(m) });
  pp.panel.classList.add('terminal');
  const btn = h('button', { class: 'btn block' }, icon('check'), 'Подтвердить оплату');
  btn.addEventListener('click', () => {
    if (game.counter.confirmCard()) ui.close(m);
  });
  pp.body.append(h('div', { class: 'term-screen' }, String(checkoutTotal(c))), h('div', { class: 'hint' }, icon('card'), 'Покупатель приложил карту'), btn);
  const m: Modal = { id: 'terminal', el: pp.overlay };
  ui.open(m);
  game.audio.play('card');
}
