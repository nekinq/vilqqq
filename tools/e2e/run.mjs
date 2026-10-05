// QA-бот: проходит обучение и первый день реальными действиями игрока (прицел, E, ЛКМ, планшет, каталог, касса),
// проверяет правила экономики и сохранения. Запуск: node tools/e2e/run.mjs [папка-для-скриншотов]
// Нужен запущенный dev-сервер (npm run dev). Ходьба заменена телепортом — всё остальное как у игрока.
import { mkdirSync } from 'node:fs';
import { launch, openGame, g, sleep, until, frames, press, click } from './lib.mjs';

const OUT = process.argv[2] ?? '.qa';
mkdirSync(OUT, { recursive: true });
const { browser, page, logs } = await launch({ width: 960, height: 540 });
const results = [];
let step = 0;
const shot = async (n) => {
  await frames(page, 2);
  await page.screenshot({ path: `${OUT}/${String(++step).padStart(2, '0')}_${n}.png` });
};
const check = (name, ok, info = '') => {
  results.push({ name, ok, info });
  console.log(`${ok ? '✔' : '✘'} ${name}${info ? ' — ' + info : ''}`);
};
const isOpen = (id) => g(page, (G, id) => G.game.ui.isOpen(id), id);
const focusId = async () => (await g(page, (G) => G.focus())).id;
const stand = (x, z, look) => g(page, (G, a) => { G.teleport(a.x, a.z); if (a.look) G.look(a.look.x, a.look.y, a.look.z); }, { x, z, look });
const aim = async (p) => {
  await g(page, (G, p) => G.look(p.x, p.y, p.z), p);
  await frames(page, 2);
};
const hold = async (cond, timeout = 60000, arg) => {
  await g(page, (G) => G.hold('primary', true));
  try {
    await until(page, cond, timeout, arg);
  } finally {
    await g(page, (G) => G.hold('primary', false));
    await frames(page, 2);
  }
};

async function talk(id) {
  const t = (await g(page, (G) => G.targets())).vendors[id];
  await stand(t.stand.x, t.stand.z, t.look);
  await frames(page, 2);
  const f = await focusId();
  if (f !== `vendor:${id}`) throw new Error(`не вижу продавца ${id}: фокус ${f}`);
  await press(page, 'interact');
  for (let i = 0; i < 16 && !(await isOpen('catalog')); i++) {
    if (await isOpen('dialogue')) await click(page, '.dialogue-layer');
    await frames(page, 2);
  }
  if (!(await isOpen('catalog'))) throw new Error('каталог не открылся');
}

async function buyInCatalog(name) {
  await click(page, '.panel .chip', name);
  await click(page, '.buy-row .btn', 'Купить');
}

async function toDumpster() {
  const t = await g(page, (G) => G.targets());
  await stand(t.dumpster.x - 2.0, t.dumpster.z - 0.6, t.dumpster);
  await frames(page, 2);
  await press(page, 'interact');
}

try {
  await openGame(page, 'autostart=new&quality=low&maxdt=0.4&test');
  const s0 = await g(page, (G) => ({ money: G.state.money, day: G.state.day, phase: G.state.phase }));
  check('Старт: 350 монет, день 1, подготовка', s0.money === 350 && s0.day === 1 && s0.phase === 'preparation', JSON.stringify(s0));
  await shot('start');

  // ── Знакомство с поставщиками ──
  for (const id of ['grocery', 'bakery', 'produce', 'dairy', 'butcher']) {
    await talk(id);
    await click(page, '.panel-head .x');
  }
  const met = await g(page, (G) => G.state.suppliersMet.length);
  check('Знакомство со всеми 5 поставщиками через диалог', met === 5, `${met}/5`);
  check('Каталог не закрывает время (смена ещё не открыта, часы стоят)', (await g(page, (G) => G.state.minutes)) === 480);

  // ── Магазин ──
  await stand(0, 7.4, { x: 0, y: 1.5, z: 9 });
  await frames(page, 3);
  check('Магазин найден (крыльцо)', await g(page, (G) => G.state.tutorial.reachedShop));
  check('Смену нельзя открыть до уборки', (await g(page, (G) => G.sim.openBlockers())).length > 0);

  // ── Доски ──
  for (let round = 0; round < 3; round++) {
    let t = await g(page, (G) => G.targets());
    const nailed = t.boards.map((b, i) => [b, i]).filter(([b]) => b.state === 'nailed').slice(0, 3);
    for (const [b, i] of nailed) {
      await stand(b.x, 7.25, b);
      await frames(page, 2);
      await hold((G, i) => G.state.restoration.boards[i] !== 'nailed', 30000, i);
    }
    await frames(page, 8);
    t = await g(page, (G) => G.targets());
    for (const [, i] of nailed) {
      const lb = t.boards[i];
      await stand(lb.x - 0.2, lb.z - 1.3, lb);
      await frames(page, 2);
      await press(page, 'interact');
    }
    const held = await g(page, (G) => G.state.player.held);
    if (held.kind !== 'boards') break;
    await toDumpster();
  }
  const boards = await g(page, (G) => G.state.restoration.boards);
  check('Доски: оторвать (удержание 2 с), отнести в контейнер', boards.every((b) => b === 'disposed'), boards.join(','));

  // ── Паутина (метла) ──
  await press(page, 'broom');
  const tw = (await g(page, (G) => G.targets())).webs;
  for (let i = 0; i < tw.length; i++) {
    const w = tw[i];
    const cx = w.x < 0 ? w.x + 1.6 : w.x > 6 ? w.x - 1.6 : w.x;
    const cz = w.z > 19 ? w.z - 1.6 : w.z < 10 ? w.z + 1.6 : w.z;
    await stand(cx, cz, w);
    await frames(page, 2);
    await hold((G, i) => G.state.restoration.webs[i], 30000, i);
  }
  check('Паутина убрана метлой', (await g(page, (G) => G.state.restoration.webs)).every(Boolean));

  // ── Пятна (метла) ──
  const ts = (await g(page, (G) => G.targets())).stains;
  for (let i = 0; i < ts.length; i++) {
    const st = ts[i];
    await stand(st.x, st.z + 1.1, { x: st.x, y: st.y, z: st.z });
    await frames(page, 2);
    await hold((G, i) => G.state.restoration.stains[i] <= 0, 40000, i);
  }
  check('Пятна оттёрты', (await g(page, (G) => G.state.restoration.stains)).every((v) => v <= 0));

  // ── Мусор ──
  await press(page, 'hands');
  for (let trip = 0; trip < 2; trip++) {
    const tt = (await g(page, (G) => G.targets())).waste;
    const left = await g(page, (G) => G.state.restoration.waste.map((w, i) => (w === 'placed' ? i : -1)).filter((i) => i >= 0));
    for (const i of left.slice(0, 2)) {
      const w = tt[i];
      await stand(w.x + (w.x > 0 ? -1.2 : 1.2), w.z, w);
      await frames(page, 2);
      await press(page, 'interact');
    }
    await toDumpster();
  }
  const waste = await g(page, (G) => G.state.restoration.waste);
  check('Мусор вынесен', waste.every((w) => w === 'disposed'), waste.join(','));
  check('Реставрация завершена', await g(page, (G) => G.sim.restoration.complete()));
  await stand(1.8, 18.6, { x: -2, y: 1.2, z: 11 });
  await shot('restored');

  // ── Стеллаж через планшет ──
  await press(page, 'tablet');
  await click(page, '.tab', 'Оборудование');
  await click(page, '.tab-body .btn', 'Купить · 180');
  check('Стеллаж куплен за 180', (await g(page, (G) => G.state.money)) === 170);
  await click(page, '.tab-body .btn', 'Поставить');
  await stand(-2.5, 18.2, { x: -2.5, y: 0.3, z: 14.4 });
  await frames(page, 4);
  const pl = await g(page, (G) => G.game.stock.placement && { valid: G.game.stock.placement.valid, reason: G.game.stock.placement.reason });
  check('Расстановка: место допустимо', !!pl?.valid, JSON.stringify(pl));
  await shot('placement');
  await press(page, 'primary');
  await frames(page, 3);
  const furn = await g(page, (G) => G.state.furniture);
  check('Стеллаж поставлен', furn.length === 1, JSON.stringify(furn));

  // ── Заказы ──
  for (const [id, name] of [['bakery', 'Хлеб'], ['grocery', 'Вода'], ['produce', 'Яблоки']]) {
    await talk(id);
    await buyInCatalog(name);
    await click(page, '.panel-head .x');
  }
  const money = await g(page, (G) => G.state.money);
  check('Первая закупка: 350 − 180 − 32 − 24 − 16 = 98', money === 98, String(money));
  check('Коробки в зоне доставки: 3', (await g(page, (G) => G.state.boxes.filter((b) => b.loc.kind === 'delivery').length)) === 3);

  // ── Раскладка ──
  const fid = furn[0].id;
  const keys = [`${fid}#4`, `${fid}#3`, `${fid}#5`];
  for (let k = 0; k < 3; k++) {
    const t = await g(page, (G) => G.targets());
    const slot = await g(page, (G) => G.state.boxes.find((b) => b.loc.kind === 'delivery')?.loc.slot);
    const d = t.delivery[slot];
    await stand(d.x, d.z - 1.4, d);
    await frames(page, 2);
    await press(page, 'interact');
    const sec = await g(page, (G, key) => G.section(key), keys[k]);
    await stand(sec.access.x, sec.access.z + 0.6, sec.slot);
    await frames(page, 2);
    await press(page, 'primary');
    await hold((G) => {
      const h = G.state.player.held;
      const b = h.kind === 'box' && G.state.boxes.find((q) => q.id === h.boxId);
      return !b || b.count === 0;
    }, 60000);
    await frames(page, 6);
    await toDumpster();
  }
  const stocked = await g(page, (G, keys) => keys.map((k) => G.state.sections[k]), keys);
  check('Разложено 3×8 единиц', stocked.every((s) => s && s.count === 8), JSON.stringify(stocked));
  check('Пустые коробки выброшены', (await g(page, (G) => G.state.boxes.length)) === 0);
  await shot('stocked');

  // ── Цена ──
  const sec0 = await g(page, (G, key) => G.section(key), keys[0]);
  await stand(sec0.access.x, sec0.access.z + 0.6, sec0.slot);
  await frames(page, 2);
  await press(page, 'interact');
  await frames(page, 2);
  check('Редактор цены открывается [E] на полке', await isOpen('price'));
  await shot('price');
  await press(page, 'pause');
  await frames(page, 2);

  // ── Смена ──
  await press(page, 'tablet');
  await click(page, '.tab', 'Сводка');
  await click(page, '.tab-body .btn', 'Открыть смену');
  check('Смена открыта', (await g(page, (G) => G.state.phase)) === 'open');

  // ── Касса ──
  async function serveOne() {
    await until(page, (G) => G.state.checkout && G.state.checkout.stage === 'scanning', 400000);
    await stand(5.85, 11.8, { x: 4.6, y: 1.0, z: 11.65 });
    for (let i = 0; i < 12; i++) {
      const ok = await g(page, (G) => {
        const c = G.state.checkout;
        const it = c && c.items.find((q) => !q.scanned);
        if (!it) return false;
        const v = G.game.counter.items.find((q) => q.uid === it.uid);
        G.look(v.mesh.position.x, v.mesh.position.y + 0.06, v.mesh.position.z);
        return true;
      });
      if (!ok) break;
      await frames(page, 2);
      await press(page, 'primary');
    }
    const c = await g(page, (G) => G.state.checkout && { stage: G.state.checkout.stage, method: G.state.checkout.method });
    if (!c || c.stage !== 'payment') return false;
    if (c.method === 'card') {
      await g(page, (G) => { const t = G.game.counter.obj.getObjectByName('terminal'); const p = t.getWorldPosition(new t.position.constructor()); G.look(p.x, p.y + 0.05, p.z); });
      await frames(page, 2);
      await press(page, 'interact');
      await click(page, '.terminal .btn', 'Подтвердить');
    } else {
      await g(page, (G) => { const c = G.game.counter; G.look(c.cashObj.position.x, c.cashObj.position.y, c.cashObj.position.z); });
      await frames(page, 2);
      await press(page, 'interact');
      await g(page, (G) => { const d = G.game.counter.obj.getObjectByName('drawer'); const p = d.getWorldPosition(new d.position.constructor()); G.look(p.x, p.y + 0.05, p.z); });
      await frames(page, 2);
      await press(page, 'interact');
      const need = await g(page, (G) => G.state.checkout.cashGiven - G.state.checkout.items.reduce((a, i) => a + i.price, 0));
      let left = need;
      for (const d of [100, 50, 20, 10, 5, 2, 1]) {
        while (left >= d) {
          await page.evaluate((d) => [...document.querySelectorAll('.denom')].find((e) => e.textContent === String(d)).click(), d);
          left -= d;
        }
      }
      await frames(page, 2);
      await click(page, '.drawer .btn-row .btn', need === 0 ? 'Закрыть' : 'Выдать');
    }
    await frames(page, 3);
    return true;
  }
  const served = await serveOne();
  check('Первый покупатель обслужен (сканер + оплата)', served && (await g(page, (G) => G.state.ledger.customersServed)) >= 1);
  await frames(page, 4);
  const tut = await g(page, (G) => ({ done: G.state.tutorial.done, rewarded: G.state.tutorial.rewarded, xp: G.state.xp }));
  check('Обучение пройдено, +20 XP один раз', tut.done && tut.rewarded, JSON.stringify(tut));

  // Досрочное закрытие и обслуживание оставшихся.
  await press(page, 'tablet');
  await click(page, '.tab', 'Сводка');
  await click(page, '.tab-body .btn', 'Закрыть смену');
  await click(page, '.overlay .btn', 'Закрыть');
  const ph = await g(page, (G) => ({ phase: G.state.phase, minutes: G.state.minutes }));
  check('Досрочное закрытие без прыжка времени', ph.phase === 'closing' && ph.minutes < 23 * 60, JSON.stringify(ph));
  for (let i = 0; i < 6; i++) {
    const busy = await g(page, (G) => G.state.phase !== 'report' && (G.state.customers.length > 0 || !!G.state.checkout));
    if (!busy) break;
    const has = await g(page, (G) => G.state.customers.some((c) => ['toQueue', 'queue', 'placing', 'waitScan', 'shopping', 'toShelf', 'picking', 'entering', 'arriving'].includes(c.phase)));
    if (!has) break;
    try {
      await serveOne();
    } catch {
      break;
    }
  }
  await until(page, (G) => G.state.phase === 'report', 400000);
  await until(page, (G) => G.game.ui.isOpen('report'), 60000);
  await shot('report');
  const L = await g(page, (G) => G.state.history[G.state.history.length - 1]);
  const profit = L.revenue - L.costOfGoodsSold - L.wages;
  const shownProfit = await page.evaluate(() => {
    const r = [...document.querySelectorAll('.report .rows .r')].find((e) => e.textContent.includes('Прибыль'));
    return r ? r.querySelector('b').textContent.replace('−', '-').replace('+', '') : null;
  });
  check('Отчёт: Прибыль = Выручка − Себестоимость − Зарплаты', Number(shownProfit) === profit, `${L.revenue} − ${L.costOfGoodsSold} − ${L.wages} = ${profit}, в окне: ${shownProfit}`);
  check('Отчёт: баланс сходится', L.closingBalance === L.openingBalance + L.revenue - L.productPurchases - L.equipmentPurchases - L.licensePurchases - L.hireFees - L.wages, JSON.stringify(L));
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('.report .btn')].find((e) => e.textContent.includes('Начать новый день'));
    b.click();
    b.click();
  });
  await frames(page, 3);
  const nd = await g(page, (G) => ({ day: G.state.day, phase: G.state.phase, minutes: G.state.minutes }));
  check('«Начать новый день» срабатывает один раз', nd.day === 2 && nd.phase === 'preparation' && nd.minutes === 480, JSON.stringify(nd));

  // ── Сохранение и загрузка ──
  const before = await g(page, (G) => ({ money: G.state.money, furniture: G.state.furniture.length, sections: Object.values(G.state.sections).reduce((a, s) => a + s.count, 0), xp: G.state.xp, rep: G.state.reputation, day: G.state.day }));
  await g(page, (G) => G.game.flow.saveTo('slot1'));
  await sleep(500);
  await openGame(page, 'quality=low&maxdt=0.4&test');
  await sleep(800);
  await click(page, '.menu .btn', 'Продолжить');
  await until(page, (G) => G.game.mode === 'play', 60000);
  await frames(page, 4);
  const after = await g(page, (G) => ({ money: G.state.money, furniture: G.state.furniture.length, sections: Object.values(G.state.sections).reduce((a, s) => a + s.count, 0), xp: G.state.xp, rep: G.state.reputation, day: G.state.day }));
  check('Сохранение → перезагрузка → «Продолжить»: состояние совпадает', JSON.stringify(before) === JSON.stringify(after), `${JSON.stringify(before)} vs ${JSON.stringify(after)}`);
  await shot('loaded');
  const errs = await g(page, (G) => G.errors);
  check('Нет ошибок JS', errs.length === 0, errs.slice(0, 3).join(' | '));
} catch (e) {
  check('Сценарий выполнен без исключений', false, e.message.slice(0, 400));
  await page.screenshot({ path: `${OUT}/error.png` });
}
const bad = results.filter((r) => !r.ok);
console.log(`\nИтого: ${results.length - bad.length}/${results.length} проверок пройдено`);
if (logs.length) console.log('Логи браузера:\n' + logs.slice(0, 25).join('\n'));
await browser.close();
process.exit(bad.length ? 1 : 0);
