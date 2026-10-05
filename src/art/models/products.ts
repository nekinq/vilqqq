import { ModelBuilder, type PartOptions } from '../ModelKit';
import { defineAsset } from '../registry';
import type { ProductId } from '../../data/products';

/**
 * 17 товаров (UI-01: хлеб, бутылки, яблоки в ящиках, молочка в холодильниках).
 * Все детали — материал «flat» с вершинными цветами: одна геометрия на SKU → InstancedMesh.
 * Пивот — центр основания. Габарит ≤ 0.19 × 0.24 × 0.2 — 8 штук (4×2) в секции 0.78 × 0.44.
 */

const flat = (color: number, extra: Partial<PartOptions> = {}): PartOptions => ({ color, noShadow: true, ...extra });

const BUILDERS: Record<ProductId, (b: ModelBuilder) => void> = {
  bread: (b) => {
    b.dome(0.1, 9, 4, [0, 0, 0], flat(0xc98a45, { faceJitter: 0.04 }), [1.05, 0.85, 0.62]);
    b.cyl(0.098, 0.1, 0.012, 9, [0, 0.003, 0], flat(0xa86a30), undefined);
    for (let i = -1; i <= 1; i++) b.box([0.016, 0.012, 0.055], [i * 0.05, 0.083, 0], flat(0xf0c890), [0, 0.6, 0]);
  },
  water: (b) => {
    b.lathe(
      [
        [0, 0],
        [0.034, 0],
        [0.036, 0.02],
        [0.036, 0.15],
        [0.028, 0.19],
        [0.014, 0.215],
        [0.012, 0.235],
        [0, 0.235],
      ],
      8,
      [0, 0, 0],
      flat(0x9fd0ea, { smooth: false }),
    );
    b.cyl(0.0372, 0.0372, 0.06, 8, [0, 0.09, 0], flat(0x2f7fc4));
    b.cyl(0.0125, 0.0125, 0.02, 6, [0, 0.245, 0], flat(0x1f5aa0));
  },
  apples: (b) => {
    b.box([0.16, 0.03, 0.11], [0, 0.015, 0], flat(0xd6c39a));
    for (const [x, z] of [
      [-0.045, -0.025],
      [0.045, -0.025],
      [0, 0.03],
    ] as const) {
      b.sphere(0.04, 7, 5, [x, 0.068, z], flat(0xd2402e, { faceJitter: 0.05 }), [1, 0.92, 1]);
      b.cyl(0.003, 0.003, 0.02, 3, [x, 0.112, z], flat(0x5a3a1e));
    }
    b.sphere(0.036, 7, 5, [0.0, 0.1, -0.005], flat(0xe05535, { faceJitter: 0.05 }), [1, 0.92, 1]);
  },
  flour: (b) => {
    b.chamferBox([0.12, 0.19, 0.08], [0, 0.095, 0], 0.02, flat(0xf2ead6));
    b.box([0.122, 0.07, 0.082], [0, 0.09, 0], flat(0x2f7f78));
    b.box([0.09, 0.015, 0.06], [0, 0.198, 0], flat(0xe2d8bc));
  },
  pasta: (b) => {
    b.box([0.13, 0.19, 0.05], [0, 0.095, 0], flat(0xf2c94c));
    b.box([0.132, 0.06, 0.052], [0, 0.14, 0], flat(0x2a5a9a));
    b.box([0.07, 0.07, 0.054], [0, 0.07, 0], flat(0xf6e8b0));
  },
  canned: (b) => {
    b.cyl(0.04, 0.04, 0.11, 10, [0, 0.055, 0], flat(0xc4c9cc, { smooth: true }));
    b.cyl(0.0405, 0.0405, 0.075, 10, [0, 0.055, 0], flat(0xb84a3a, { smooth: true }));
    b.cyl(0.041, 0.041, 0.02, 10, [0, 0.055, 0], flat(0xf2ead6, { smooth: true }));
  },
  buns: (b) => {
    b.box([0.17, 0.015, 0.11], [0, 0.0075, 0], flat(0xf2ead6));
    for (const [x, z] of [
      [-0.045, -0.02],
      [0.045, -0.02],
      [0, 0.03],
    ] as const)
      b.dome(0.042, 8, 3, [x, 0.015, z], flat(0xe2a456, { faceJitter: 0.05 }), [1, 0.9, 1]);
  },
  tomatoes: (b) => {
    b.box([0.16, 0.03, 0.11], [0, 0.015, 0], flat(0xe6dcc6));
    for (const [x, z] of [
      [-0.045, -0.025],
      [0.045, -0.025],
      [0, 0.03],
    ] as const) {
      b.sphere(0.038, 8, 5, [x, 0.064, z], flat(0xe2492f, { faceJitter: 0.04 }), [1, 0.82, 1]);
      b.cyl(0.012, 0.016, 0.008, 5, [x, 0.098, z], flat(0x4a8a3a));
    }
  },
  carrots: (b) => {
    for (let i = 0; i < 3; i++) {
      const z = -0.035 + i * 0.035;
      b.cone(0.017, 0.15, 6, [-0.0, 0.02, z], flat(0xf08a2b), [0, 0, Math.PI / 2]);
      b.cone(0.012, 0.07, 4, [0.1, 0.022, z], flat(0x5f9a3a), [0, 0, -Math.PI / 2]);
    }
    b.box([0.02, 0.025, 0.11], [0.068, 0.02, 0], flat(0xd5ac64));
  },
  condensed_milk: (b) => {
    b.cyl(0.038, 0.038, 0.085, 10, [0, 0.0425, 0], flat(0xc4c9cc, { smooth: true }));
    b.cyl(0.0385, 0.0385, 0.06, 10, [0, 0.0425, 0], flat(0x2f5f9a, { smooth: true }));
    b.cyl(0.039, 0.039, 0.018, 10, [0, 0.05, 0], flat(0xf4f1e8, { smooth: true }));
  },
  milk: (b) => {
    b.box([0.07, 0.17, 0.07], [0, 0.085, 0], flat(0xf6f4ee));
    b.box([0.0705, 0.06, 0.0705], [0, 0.1, 0], flat(0x3d7ac0));
    b.prism(0.07, 0.035, 0.07, [0, 0.17, 0], flat(0xf6f4ee), undefined);
    b.box([0.015, 0.02, 0.015], [0.02, 0.2, 0], flat(0x3d7ac0));
  },
  cheese: (b) => {
    b.extrude(
      [
        [0, 0],
        [0.15, 0.04],
        [0.15, -0.04],
      ],
      0.06,
      [-0.07, 0.03, 0],
      flat(0xf0c64a),
      [Math.PI / 2, 0, 0],
    );
    b.box([0.012, 0.06, 0.085], [0.083, 0.03, 0], flat(0xc0392b));
  },
  yogurt: (b) => {
    b.cyl(0.036, 0.03, 0.075, 10, [0, 0.0375, 0], flat(0xf6f2ea, { smooth: true }));
    b.cyl(0.0362, 0.031, 0.035, 10, [0, 0.04, 0], flat(0xe48aaa, { smooth: true }));
    b.cyl(0.038, 0.038, 0.006, 10, [0, 0.078, 0], flat(0xc8cdd0));
  },
  butter: (b) => {
    b.chamferBox([0.1, 0.045, 0.06], [0, 0.0225, 0], 0.008, flat(0xd5ac64));
    b.box([0.06, 0.046, 0.061], [0, 0.0225, 0], flat(0x2f6a8a));
  },
  sausage: (b) => {
    b.cyl(0.024, 0.024, 0.19, 8, [0, 0.024, 0], flat(0x9a3a2e, { smooth: true }), [0, 0, Math.PI / 2]);
    for (const x of [-0.098, 0.098]) b.sphere(0.012, 5, 4, [x, 0.024, 0], flat(0xd5ac64));
    b.cyl(0.0245, 0.0245, 0.05, 8, [0.03, 0.024, 0], flat(0xf2ead6, { smooth: true }), [0, 0, Math.PI / 2]);
  },
  chicken: (b) => {
    b.box([0.17, 0.02, 0.12], [0, 0.01, 0], flat(0x2f5a46));
    b.sphere(0.055, 8, 5, [0, 0.05, 0], flat(0xf0c8a0, { faceJitter: 0.03 }), [1.25, 0.7, 0.95]);
    for (const s of [-1, 1]) b.sphere(0.024, 6, 4, [0.06, 0.05, s * 0.035], flat(0xe8b88a), [1.4, 0.8, 0.8]);
    b.box([0.165, 0.004, 0.115], [0, 0.085, 0], flat(0xe6f0f2));
  },
  steaks: (b) => {
    b.box([0.17, 0.018, 0.12], [0, 0.009, 0], flat(0x2b2f2c));
    for (const x of [-0.04, 0.04]) b.chamferBox([0.07, 0.022, 0.1], [x, 0.03, 0], 0.01, flat(0xb8443a, { faceJitter: 0.05 }));
    b.box([0.165, 0.004, 0.115], [0, 0.046, 0], flat(0xdde9f2));
  },
};

const NAMES: Record<ProductId, string> = {
  bread: 'Хлеб',
  water: 'Вода',
  apples: 'Яблоки',
  flour: 'Мука',
  pasta: 'Макароны',
  canned: 'Консервы',
  buns: 'Булочки',
  tomatoes: 'Помидоры',
  carrots: 'Морковь',
  condensed_milk: 'Сгущёнка',
  milk: 'Молоко',
  cheese: 'Сыр',
  yogurt: 'Йогурт',
  butter: 'Масло',
  sausage: 'Колбаса',
  chicken: 'Курица',
  steaks: 'Стейки',
};

(Object.keys(BUILDERS) as ProductId[]).forEach((id, i) => {
  defineAsset({
    id: `prod_${id}`,
    name: `Товар: ${NAMES[id]}`,
    category: 'product',
    func: 'Единица товара на полке, в коробке, в корзине, на кассе (инстансинг)',
    ref: 'UI-01 (товар на полках), UI-02 (хлеб)',
    pivot: 'центр основания',
    collider: 'хитбокс секции',
    build: () => {
      const b = new ModelBuilder(800 + i);
      BUILDERS[id](b);
      return b.build(`prod_${id}`);
    },
  });
});

/** Картонная коробка: узлы flap_* (клапаны) открываются; label_* — этикетки (материал по SKU). */
export const BOX_SIZE3 = { w: 0.5, h: 0.3, d: 0.36 } as const;

defineAsset({
  id: 'box_cardboard',
  name: 'Коробка с товаром',
  category: 'product',
  func: '8 единиц одного товара; брать, открывать, раскладывать, выбрасывать',
  ref: 'Shop/SHOP-00 (коробки у навеса)',
  pivot: 'центр дна',
  anims: 'клапаны flap_N/S/E/W',
  build: () => {
    const b = new ModelBuilder(840);
    const { w, h, d } = BOX_SIZE3;
    const card: PartOptions = { color: 0xc49a6c, jitter: 0.03 };
    const t = 0.012;
    b.box([w, t, d], [0, t / 2, 0], card);
    b.box([w, h, t], [0, h / 2, d / 2 - t / 2], card);
    b.box([w, h, t], [0, h / 2, -d / 2 + t / 2], card);
    b.box([t, h, d], [w / 2 - t / 2, h / 2, 0], card);
    b.box([t, h, d], [-w / 2 + t / 2, h / 2, 0], card);
    // Скотч по рёбрам.
    b.box([w + 0.003, 0.05, 0.003], [0, h - 0.025, d / 2 + 0.001], { color: 0xd8b98a, noShadow: true });
    b.box([w + 0.003, 0.05, 0.003], [0, h - 0.025, -d / 2 - 0.001], { color: 0xd8b98a, noShadow: true });
    // Клапаны: пивот на ребре.
    b.node('flap_N', [0, h, -d / 2], undefined, (nb) => nb.box([w, 0.008, d / 2], [0, 0.004, d / 4], card));
    b.node('flap_S', [0, h, d / 2], undefined, (nb) => nb.box([w, 0.008, d / 2], [0, 0.004, -d / 4], card));
    b.node('flap_W', [-w / 2, h, 0], undefined, (nb) => nb.box([w / 2, 0.006, d - 0.02], [w / 4, 0.012, 0], { color: 0xb88d60 }));
    b.node('flap_E', [w / 2, h, 0], undefined, (nb) => nb.box([w / 2, 0.006, d - 0.02], [-w / 4, 0.012, 0], { color: 0xb88d60 }));
    b.node('label_F', [0, h * 0.48, d / 2 + 0.002], undefined, (nb) => nb.plane(0.26, 0.13, [0, 0, 0], { mat: 'sign:box_generic', noShadow: true }));
    b.node('label_B', [0, h * 0.48, -d / 2 - 0.002], [0, Math.PI, 0], (nb) => nb.plane(0.26, 0.13, [0, 0, 0], { mat: 'sign:box_generic', noShadow: true }));
    return b.build('box_cardboard');
  },
});

defineAsset({
  id: 'banknote',
  name: 'Купюра',
  category: 'tool',
  func: 'Наличные покупателя на прилавке и в руке',
  ref: 'UI-01 (наличные)',
  build: () => {
    const b = new ModelBuilder(841);
    b.box([0.14, 0.002, 0.07], [0, 0.001, 0], { color: 0x8ec29a, noShadow: true });
    b.box([0.04, 0.0025, 0.04], [0.03, 0.001, 0], { color: 0x5a9a6a, noShadow: true });
    b.box([0.14, 0.0022, 0.07], [0.005, 0.003, 0.008], { color: 0x9fcfa8, noShadow: true }, [0, 0.15, 0]);
    return b.build('banknote');
  },
});
