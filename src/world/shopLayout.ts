/**
 * Геометрия магазина бабушки — общий источник для модели, коллизий, навигации и геймплея.
 * Локальная система магазина: начало — центр зала на уровне земли; −Z — фасад (север, на площадь).
 * Мировая позиция начала — SHOP_ORIGIN (поворота нет, локальные оси = мировые).
 */

export const SHOP_ORIGIN = { x: 0, z: 14.5 } as const;
export const FLOOR_Y = 0.3;

export interface Rect {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

export const SHOP = {
  floorY: FLOOR_Y,
  wallT: 0.2,
  wallH: 3.6,
  ceilingH: 3.45,
  wainscotH: 1.05,
  roofPitchDeg: 30,
  roofOverhang: 0.55,
  /** Наружные линии стен зала. */
  hall: { x0: -7, x1: 7, z0: -5.5, z1: 5.5 } as Rect,
  /** Чистая внутренняя площадь зала. */
  hallInner: { x0: -6.8, x1: 6.8, z0: -5.3, z1: 5.3 } as Rect,
  frontDoor: { x0: -0.7, x1: 0.7, h: 2.35 },
  frontWindows: [
    { x0: -5.8, x1: -2.2, y0: 0.85, y1: 2.65 },
    { x0: 2.2, x1: 5.8, y0: 0.85, y1: 2.65 },
  ],
  westWindows: [
    { z0: -3.9, z1: -1.9, y0: 0.95, y1: 2.55 },
    { z0: 0.7, z1: 2.7, y0: 0.95, y1: 2.55 },
  ],
  backDoor: { x0: 0.45, x1: 1.55, h: 2.25 },
  backWindow: { x0: -4.6, x1: -2.6, y0: 1.0, y1: 2.5 },
  /** Дверь из зала в склад (восточная стена зала). */
  warehouseDoor: { z0: 1.6, z1: 3.0, h: 2.3 },
  /** Склад (пристройка на востоке). */
  warehouse: { x0: 7, x1: 13, z0: -0.5, z1: 5.5 } as Rect,
  warehouseInner: { x0: 7.2, x1: 12.8, z0: -0.3, z1: 5.3 } as Rect,
  warehouseOuterDoor: { x0: 9.2, x1: 10.8, h: 2.35 },
  warehouseWallH: 3.1,
  /** Навес доставки (Z-DELIVERY). */
  leanTo: { x0: 7, x1: 13, z0: -6.5, z1: -0.5 } as Rect,
  /** Крыльцо. */
  porch: { x0: -7.6, x1: 7, z0: -8.0, z1: -5.5 } as Rect,
  porchRoofH: 3.35,
  /** Ступени перед дверью. */
  steps: { x0: -1.6, x1: 1.6, z0: -8.8, z1: -8.0 },
  /** Задний двор и ступени задней двери. */
  backSteps: { x0: 0.2, x1: 1.8, z0: 5.5, z1: 6.4 },
} as const;

/** Касса (прилавок) в локальных координатах магазина. Покупатель — с запада, кассир — с востока. */
export const COUNTER = {
  x: 4.75,
  z: -2.7,
  len: 2.4,
  depth: 0.7,
  height: 0.95,
  /** Позиция игрока за кассой. */
  operator: { x: 5.85, z: -2.7 },
  /** Очередь: 0 — у прилавка. */
  queue: [
    { x: 3.8, z: -3.1 },
    { x: 3.75, z: -2.05 },
    { x: 3.65, z: -1.0 },
    { x: 3.55, z: 0.05 },
  ],
} as const;

/** Контейнер для мусора (мировые координаты). */
export const DUMPSTER = { x: 14.9, z: 11.6, rotY: -Math.PI / 2 } as const;

/** Поддоны зоны доставки (локальные координаты магазина), по 4 места на каждом. */
export const DELIVERY_PALLETS = [
  { x: 7.95, z: -3.4 },
  { x: 12.0, z: -4.9 },
  { x: 12.0, z: -2.2 },
] as const;

/** 12 мест доставки (локальные координаты, верх поддона). */
export function deliverySlots(): { x: number; y: number; z: number }[] {
  const out: { x: number; y: number; z: number }[] = [];
  for (const p of DELIVERY_PALLETS) {
    for (const dz of [-0.26, 0.26]) for (const dx of [-0.3, 0.3]) out.push({ x: p.x + dx, y: FLOOR_Y + 0.14, z: p.z + dz });
  }
  return out;
}

export function toWorld(x: number, z: number): { x: number; z: number } {
  return { x: x + SHOP_ORIGIN.x, z: z + SHOP_ORIGIN.z };
}

export function toLocal(x: number, z: number): { x: number; z: number } {
  return { x: x - SHOP_ORIGIN.x, z: z - SHOP_ORIGIN.z };
}

/** Зоны зала, где нельзя ставить мебель (локальные): вход, касса и очередь, двери. */
export const KEEP_CLEAR: Rect[] = [
  { x0: -1.6, x1: 1.6, z0: -5.3, z1: -3.2 }, // вход
  { x0: 2.9, x1: 6.8, z0: -5.3, z1: 0.6 }, // касса, место кассира, очередь
  { x0: 5.4, x1: 6.8, z0: 1.0, z1: 3.6 }, // дверь склада
  { x0: -0.2, x1: 2.2, z0: 4.0, z1: 5.3 }, // задняя дверь
];

/** Где можно ставить торговое оборудование (зал) и складские стеллажи (склад и зал). */
export const PLACEMENT_AREAS = {
  hall: SHOP.hallInner,
  warehouse: SHOP.warehouseInner,
} as const;
