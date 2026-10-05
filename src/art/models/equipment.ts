import { ModelBuilder, type PartOptions } from '../ModelKit';
import { P } from '../palette';
import { defineAsset } from '../registry';

/**
 * Торговое и кассовое оборудование (UI-01: деревянные стеллажи, стеклянные холодильники;
 * SHOP-01: тёмно-зелёный прилавок с деревянной столешницей, монитор, сканер, терминал).
 * Пивот — центр основания; «лицо» (сторона покупателя) — +Z.
 */

const woodFrame: PartOptions = { mat: 'woodgrain', color: 0xb98a58, jitter: 0.04 };
const woodShelf: PartOptions = { mat: 'woodgrain', color: 0xc99a66 };
const woodDark: PartOptions = { mat: 'woodgrain', color: 0x7e5634 };

/** Раскладка секций стеллажа: side (0 — +Z, 1 — −Z) × level × bay. */
export const SHELF_LAYOUT = {
  bays: 3,
  levels: 3,
  sides: 2,
  bayW: 0.78,
  levelY: [0.2, 0.74, 1.28],
  depthZ: 0.25,
  width: 2.5,
};

defineAsset({
  id: 'shelf_gondola',
  name: 'Стеллаж двусторонний',
  category: 'equipment',
  func: '18 секций × 8 шт., обычное хранение',
  ref: 'UI-01 (деревянные стеллажи с товаром)',
  pivot: 'центр основания; стороны ±Z',
  collider: 'бокс 2.5×1.0',
  build: () => {
    const b = new ModelBuilder(701);
    const W = SHELF_LAYOUT.width;
    // Цоколь.
    b.chamferBox([W, 0.14, 1.0], [0, 0.07, 0], 0.02, woodDark);
    // Центральная перегородка.
    b.box([W - 0.06, 1.62, 0.04], [0, 0.95, 0], { mat: 'wood', color: 0xd2a874, uvScale: 0.8 });
    // Стойки.
    for (const x of [-W / 2 + 0.04, -0.41, 0.41, W / 2 - 0.04]) {
      for (const z of [-0.48, 0.48]) b.chamferBox([0.06, 1.66, 0.05], [x, 0.97, z], 0.012, woodFrame);
      b.chamferBox([0.06, 1.66, 0.06], [x, 0.97, 0], 0.012, woodFrame);
    }
    // Полки (с обеих сторон).
    for (const y of SHELF_LAYOUT.levelY) {
      for (const s of [-1, 1]) {
        b.box([W - 0.04, 0.035, 0.46], [0, y - 0.02, s * 0.25], woodShelf);
        // Кромка-ценникодержатель.
        b.box([W - 0.04, 0.05, 0.018], [0, y - 0.015, s * 0.485], { mat: 'woodgrain', color: P.green });
      }
    }
    // Боковые панели.
    for (const x of [-W / 2, W / 2]) b.box([0.03, 1.5, 0.98], [x, 0.9, 0], { mat: 'wood', color: 0xb98a58, uvScale: 0.8 });
    // Карниз.
    b.chamferBox([W + 0.04, 0.06, 0.24], [0, 1.78, 0], 0.015, woodDark);
    return b.build('shelf_gondola');
  },
});

defineAsset({
  id: 'fridge',
  name: 'Холодильник со стеклянными дверями',
  category: 'equipment',
  func: '8 секций × 8 шт., холод',
  ref: 'UI-01 (холодильники у стены)',
  pivot: 'центр основания; двери в +Z',
  collider: 'бокс 1.7×0.85',
  build: () => {
    const b = new ModelBuilder(702);
    const W = 1.7;
    const D = 0.85;
    const H = 2.05;
    const body: PartOptions = { color: 0xf1f0ea };
    const trim: PartOptions = { color: 0x2f5a46 };
    b.chamferBox([W, 0.14, D], [0, 0.07, 0], 0.02, { color: 0x2b2f2c });
    b.box([W, H - 0.14, 0.05], [0, 0.07 + H / 2, -D / 2 + 0.025], body);
    for (const x of [-W / 2 + 0.03, W / 2 - 0.03]) b.box([0.06, H - 0.14, D], [x, 0.07 + H / 2, 0], body);
    b.chamferBox([W + 0.02, 0.26, D + 0.02], [0, H - 0.05, 0], 0.03, trim);
    b.box([W - 0.2, 0.12, 0.02], [0, H - 0.05, D / 2 + 0.012], { mat: 'emissiveAlways', color: 0xf6f2e6, noShadow: true });
    b.box([W - 0.08, 0.04, D - 0.06], [0, 0.17, 0], body);
    // Внутренняя подсветка задней стенки.
    b.box([W - 0.14, H - 0.5, 0.01], [0, 0.07 + H / 2 - 0.05, -D / 2 + 0.055], { mat: 'emissiveAlways', color: 0xdfe8ee, noShadow: true });
    // Полки: 4 уровня × 2 колонки.
    for (const y of [0.24, 0.66, 1.08, 1.5]) b.box([W - 0.14, 0.025, D - 0.14], [0, y, -0.02], { mat: 'chrome', color: 0xd8dde0 });
    b.box([0.04, H - 0.4, D - 0.1], [0, 0.07 + H / 2 - 0.1, -0.02], body);
    // Двери: рамы и стекло.
    for (const s of [-1, 1]) {
      const cx = (s * W) / 4;
      b.box([W / 2 - 0.04, 0.05, 0.04], [cx, 0.18, D / 2], trim);
      b.box([W / 2 - 0.04, 0.05, 0.04], [cx, H - 0.2, D / 2], trim);
      b.box([0.05, H - 0.38, 0.04], [cx - s * (W / 4 - 0.04), H / 2 - 0.01, D / 2], trim);
      b.box([0.05, H - 0.38, 0.04], [cx + s * (W / 4 - 0.04), H / 2 - 0.01, D / 2], trim);
      b.box([W / 2 - 0.1, H - 0.42, 0.012], [cx, H / 2 - 0.01, D / 2], { mat: 'glass', noShadow: true });
      b.box([0.03, 0.4, 0.05], [cx - s * 0.32, 1.1, D / 2 + 0.04], { mat: 'chrome', color: P.chrome });
    }
    return b.build('fridge');
  },
});

defineAsset({
  id: 'freezer',
  name: 'Морозильный ларь',
  category: 'equipment',
  func: '4 секции × 8 шт., заморозка',
  ref: 'бриф (стиль UI-01)',
  pivot: 'центр основания',
  collider: 'бокс 1.9×0.95',
  build: () => {
    const b = new ModelBuilder(703);
    const W = 1.9;
    const D = 0.95;
    const H = 0.92;
    const body: PartOptions = { color: 0xf1f0ea };
    b.chamferBox([W, 0.1, D], [0, 0.05, 0], 0.02, { color: 0x2b2f2c });
    // Короб с открытым верхом.
    b.box([W, H - 0.1, 0.06], [0, 0.1 + (H - 0.1) / 2, D / 2 - 0.03], body);
    b.box([W, H - 0.1, 0.06], [0, 0.1 + (H - 0.1) / 2, -D / 2 + 0.03], body);
    for (const x of [-W / 2 + 0.03, W / 2 - 0.03]) b.box([0.06, H - 0.1, D - 0.12], [x, 0.1 + (H - 0.1) / 2, 0], body);
    b.box([W - 0.12, 0.04, D - 0.12], [0, 0.42, 0], { color: 0xdfe8ee });
    b.box([0.04, 0.42, D - 0.12], [0, 0.62, 0], { color: 0xe6edf0 });
    b.box([W - 0.12, 0.42, 0.04], [0, 0.62, 0], { color: 0xe6edf0 });
    // Зелёная полоса и кант.
    b.box([W + 0.01, 0.1, D + 0.01], [0, 0.32, 0], { color: 0x2f5a46 });
    b.chamferBox([W + 0.03, 0.05, D + 0.03], [0, H, 0], 0.015, { mat: 'chrome', color: 0xc8cdd0 });
    // Раздвижные стеклянные крышки.
    b.box([W / 2 - 0.04, 0.012, D - 0.1], [-W / 4 + 0.01, H + 0.02, 0], { mat: 'glassFrost', noShadow: true });
    b.box([W / 2 - 0.04, 0.012, D - 0.1], [W / 4 - 0.01, H + 0.04, 0], { mat: 'glassFrost', noShadow: true });
    return b.build('freezer');
  },
});

defineAsset({
  id: 'storage_rack',
  name: 'Складской стеллаж',
  category: 'equipment',
  func: '8 мест для коробок',
  ref: 'бриф (склад B-WAREHOUSE)',
  pivot: 'центр основания',
  collider: 'бокс 2.0×0.65',
  build: () => {
    const b = new ModelBuilder(704);
    const W = 2.0;
    const D = 0.62;
    const metal: PartOptions = { mat: 'metal', color: 0x3f5a4e };
    for (const x of [-W / 2 + 0.03, W / 2 - 0.03, 0]) for (const z of [-D / 2 + 0.03, D / 2 - 0.03]) b.box([0.05, 2.0, 0.05], [x, 1.0, z], metal);
    for (const y of [0.08, 0.56, 1.04, 1.52]) {
      b.box([W, 0.035, D], [0, y, 0], { mat: 'wood', color: 0xb08a62, uvScale: 0.7 });
      b.box([W, 0.05, 0.03], [0, y + 0.005, D / 2], metal);
    }
    b.box([W, 0.04, 0.03], [0, 1.98, D / 2 - 0.03], metal);
    return b.build('storage_rack');
  },
});

/** Раскладка прилавка (локальные координаты модели): длина по X, покупатель со стороны +Z. */
export const COUNTER_LAYOUT = {
  len: 2.4,
  depth: 0.7,
  top: 0.95,
  /** Зона, куда покупатель выкладывает товар (центр и размер). */
  items: { x: 0.25, z: 0.12, w: 1.1, d: 0.34 },
  scanner: { x: -0.95, y: 0.95, z: -0.18 },
  terminal: { x: 0.95, y: 0.95, z: 0.2 },
  monitor: { x: 0.85, y: 0.95, z: -0.18 },
  drawer: { x: 0.85, y: 0.78, z: -0.36 },
  bag: { x: -0.5, y: 0.95, z: -0.2 },
  cash: { x: 0.45, y: 0.955, z: 0.22 },
};

defineAsset({
  id: 'checkout_counter',
  name: 'Кассовый прилавок',
  category: 'equipment',
  func: 'Касса: монитор, сканер, терминал, денежный ящик',
  ref: 'Shop/SHOP-01 (зелёный прилавок), UI-01',
  pivot: 'центр основания; покупатель в +Z, кассир в −Z',
  collider: 'бокс 2.4×0.7',
  anims: 'drawer (выдвигается), scanner (снимается), screen',
  build: () => {
    const b = new ModelBuilder(705);
    const L = COUNTER_LAYOUT.len;
    const D = COUNTER_LAYOUT.depth;
    const T = COUNTER_LAYOUT.top;
    const green: PartOptions = { mat: 'wood', color: 0x3a6a54, uvScale: 0.5 };
    b.box([L - 0.06, 0.1, D - 0.06], [0, 0.05, 0], { color: 0x2a3a32 });
    b.box([L, T - 0.16, D - 0.04], [0, 0.1 + (T - 0.16) / 2, 0], green);
    // Филёнки фасада (сторона покупателя).
    for (let i = 0; i < 4; i++) {
      const x = -L / 2 + 0.3 + i * 0.6;
      b.chamferBox([0.5, 0.56, 0.03], [x, 0.48, D / 2 - 0.005], 0.012, { mat: 'woodgrain', color: 0x467a62 });
    }
    // Столешница.
    b.chamferBox([L + 0.08, 0.06, D + 0.08], [0, T - 0.03, 0], 0.015, { mat: 'woodgrain', color: 0xc8935e });
    // Ниша кассира и полка.
    b.box([L - 0.2, 0.03, 0.3], [0, 0.45, -D / 2 + 0.15], { mat: 'woodgrain', color: 0x9a6d45 });
    // Монитор POS.
    const m = COUNTER_LAYOUT.monitor;
    b.cyl(0.09, 0.11, 0.03, 10, [m.x, T + 0.015, m.z], { color: 0x2b2f2c });
    b.box([0.05, 0.22, 0.05], [m.x, T + 0.14, m.z], { color: 0x2b2f2c });
    b.chamferBox([0.42, 0.3, 0.05], [m.x, T + 0.36, m.z], 0.015, { color: 0x232624 }, [-0.2, Math.PI, 0]);
    b.node('screen', [m.x, T + 0.36, m.z - 0.028], [-0.2, Math.PI, 0], (nb) => {
      nb.plane(0.38, 0.26, [0, 0, 0], { mat: 'screen', noShadow: true });
    });
    // Денежный ящик (узел, выдвигается в −Z).
    const dr = COUNTER_LAYOUT.drawer;
    b.box([0.46, 0.14, 0.4], [dr.x, dr.y, dr.z + 0.2], { color: 0x2b2f2c });
    b.node('drawer', [dr.x, dr.y, dr.z], undefined, (nb) => {
      nb.box([0.44, 0.1, 0.38], [0, 0, 0.17], { color: 0x34393a });
      nb.box([0.4, 0.02, 0.34], [0, 0.04, 0.17], { color: 0x1d2021 });
      for (let i = 0; i < 5; i++) nb.box([0.07, 0.03, 0.15], [-0.16 + i * 0.08, 0.05, 0.22], { color: i < 2 ? 0xc9a24a : 0xb4bcc2 });
      for (let i = 0; i < 3; i++) nb.box([0.12, 0.03, 0.12], [-0.13 + i * 0.13, 0.05, 0.06], { color: 0x8ec29a });
      nb.box([0.3, 0.035, 0.02], [0, 0.0, -0.01], { mat: 'chrome', color: P.chrome });
    });
    // Подставка сканера и сам сканер (узел).
    const sc = COUNTER_LAYOUT.scanner;
    b.box([0.12, 0.06, 0.14], [sc.x, T + 0.03, sc.z], { color: 0x2b2f2c });
    b.node('scanner', [sc.x, T + 0.06, sc.z], undefined, (nb) => buildScanner(nb));
    // Терминал оплаты картой (узел).
    const tm = COUNTER_LAYOUT.terminal;
    b.node('terminal', [tm.x, T, tm.z], [0, Math.PI, 0], (nb) => {
      nb.chamferBox([0.1, 0.03, 0.17], [0, 0.015, 0], 0.01, { color: 0x2b2f2c });
      nb.chamferBox([0.09, 0.05, 0.16], [0, 0.05, 0.005], 0.012, { color: 0x34393a }, [-0.35, 0, 0]);
      nb.box([0.07, 0.035, 0.005], [0, 0.07, -0.035], { mat: 'screen', noShadow: true }, [-0.35, 0, 0]);
      for (let i = 0; i < 9; i++) nb.box([0.015, 0.006, 0.012], [-0.022 + (i % 3) * 0.022, 0.058, 0.02 + Math.floor(i / 3) * 0.02], { color: 0xd8dde0, noShadow: true }, [-0.35, 0, 0]);
    });
    // Колокольчик, банка с ручками, пакеты.
    b.lathe(
      [
        [0, 0],
        [0.05, 0],
        [0.045, 0.02],
        [0.025, 0.05],
        [0.008, 0.07],
        [0, 0.08],
      ],
      10,
      [0.15, T, -0.22],
      { mat: 'metal', color: 0xd5ac64 },
    );
    b.cyl(0.04, 0.035, 0.1, 8, [-0.15, T + 0.05, -0.25], { mat: 'glass' });
    const bg = COUNTER_LAYOUT.bag;
    b.chamferBox([0.26, 0.24, 0.15], [bg.x, T + 0.12, bg.z], 0.01, { mat: 'paper', color: 0xc49a6c });
    b.marker('items', [COUNTER_LAYOUT.items.x, T, COUNTER_LAYOUT.items.z]);
    b.marker('cash', [COUNTER_LAYOUT.cash.x, T, COUNTER_LAYOUT.cash.z]);
    b.marker('bag', [bg.x, T + 0.12, bg.z]);
    return b.build('checkout_counter');
  },
});

/** Ручной сканер штрихкодов: пивот у основания рукояти. */
export function buildScanner(b: ModelBuilder): void {
  b.chamferBox([0.05, 0.11, 0.045], [0, 0.055, 0], 0.012, { color: 0x2b2f2c }, [0.25, 0, 0]);
  b.chamferBox([0.07, 0.06, 0.13], [0, 0.12, -0.04], 0.015, { color: 0x34393a });
  b.box([0.055, 0.04, 0.01], [0, 0.12, -0.105], { mat: 'emissiveAlways', color: 0xff4040, noShadow: true });
  b.box([0.02, 0.02, 0.02], [0, 0.085, 0.01], { color: 0xd5ac64, noShadow: true });
}

defineAsset({
  id: 'scanner',
  name: 'Ручной сканер',
  category: 'tool',
  func: 'Пробивать товар на кассе (ЛКМ)',
  ref: 'Shop/SHOP-01 (сканер на прилавке)',
  build: () => {
    const b = new ModelBuilder(706);
    buildScanner(b);
    return b.build('scanner');
  },
});

defineAsset({
  id: 'basket',
  name: 'Корзина покупателя',
  category: 'equipment',
  func: 'Покупатели несут товар в корзине',
  ref: 'CHAR-01 (корзина C-BASKET-01)',
  pivot: 'центр дна',
  build: () => {
    const b = new ModelBuilder(707);
    const wicker: PartOptions = { mat: 'woodgrain', color: 0xc49a5c, uvScale: 0.3 };
    b.box([0.36, 0.02, 0.24], [0, 0.01, 0], wicker);
    for (const s of [-1, 1]) {
      b.box([0.36, 0.18, 0.015], [0, 0.1, s * 0.12], wicker);
      b.box([0.015, 0.18, 0.24], [s * 0.18, 0.1, 0], wicker);
    }
    b.torus(0.15, 0.012, 4, 10, [0, 0.19, 0], wicker, [0, Math.PI / 2, 0], Math.PI);
    return b.build('basket');
  },
});
