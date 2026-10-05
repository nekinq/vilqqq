/**
 * Планировка деревни Дубравка (Docs/Planning/VillageRevamp/VillageLayout.md).
 * Чистые данные: дороги, площадь, здания, дворы, точки. X → восток, Z → юг (север = −Z).
 */

export type XZ = readonly [number, number];

export const WORLD = { x0: -64, x1: 64, z0: -56, z1: 56 } as const;

export const PLAZA = { x: 0, z: -14, rInner: 7.2, rOuter: 15, rBed: 6.6 } as const;

export interface Road {
  id: string;
  pts: XZ[];
  width: number;
  /** Сеть, по которой ходят NPC. */
  walk?: boolean;
}

/** Точка на кольце площади под углом (градусы от +X к +Z). */
export function ring(angleDeg: number, r: number = PLAZA.rOuter - 0.3): [number, number] {
  const a = (angleDeg * Math.PI) / 180;
  return [+(PLAZA.x + Math.cos(a) * r).toFixed(2), +(PLAZA.z + Math.sin(a) * r).toFixed(2)];
}

export const ROADS: Road[] = [
  { id: 'se', width: 4.6, pts: [ring(45), [15.5, 2], [19.5, 10], [20.5, 20], [24, 32], [30, 44], [35, 57]] },
  { id: 'sw', width: 4.8, pts: [ring(135), [-15, 2], [-18.5, 10], [-22, 18], [-30, 29], [-40, 41], [-50, 57]] },
  { id: 'w', width: 4.4, pts: [ring(200), [-26, -23], [-40, -26], [-52, -27], [-65, -28]] },
  { id: 'nnw', width: 4.2, pts: [ring(250), [-9, -35], [-14, -44], [-16, -57]] },
  { id: 'nne', width: 4.2, pts: [ring(290), [9, -35], [14, -44], [16, -57]] },
  { id: 'e', width: 4.4, pts: [ring(340), [26, -23], [40, -26], [52, -27], [65, -28]] },
  { id: 'loop', width: 4.2, pts: [[-22, 18], [-15, 25], [-5, 29], [6, 29], [15, 26], [20.5, 20]] },
  { id: 's', width: 4.6, pts: [[0, 29.5], [-2, 42], [-3, 57], [-3.5, 80], [-3, 112]] },
  // Подходы к прилавкам поставщиков.
  { id: 'sp_grocery', width: 4.0, pts: [ring(172), [-21, -11.2]] },
  { id: 'sp_bakery', width: 3.6, pts: [ring(232), [-13.4, -29.6]] },
  { id: 'sp_produce', width: 3.6, pts: [ring(270), [0, -35]] },
  { id: 'sp_dairy', width: 3.6, pts: [ring(308), [13.4, -29.6]] },
  { id: 'sp_butcher', width: 4.0, pts: [ring(8), [21, -11.2]] },
];

/** Мощёный двор перед магазином (от площади до крыльца). */
export const SHOP_FORECOURT = { x0: -9.5, x1: 14, z0: 0.0, z1: 6.6 } as const;

import type { SupplierId } from '../data/products';
export type { SupplierId };

export interface SupplierSite {
  id: SupplierId;
  /** Дом: центр и поворот (фасад в +Z модели смотрит по направлению rotY). */
  house: { x: number; z: number; rotY: number };
  /** Прилавок, место продавца и точка, где стоит игрок. */
  stall: { x: number; z: number; rotY: number };
  /** Двор (грунт/брусчатка) вокруг прилавка. */
  yard: { x: number; z: number; r: number };
}

/** rotY: угол поворота модели вокруг Y; модель смотрит в +Z, поворот на rotY разворачивает её. */
function faceToward(fromX: number, fromZ: number, toX: number, toZ: number): number {
  return Math.atan2(toX - fromX, toZ - fromZ);
}

const C = PLAZA;

export const SUPPLIER_SITES: Record<SupplierId, SupplierSite> = {
  grocery: {
    id: 'grocery',
    house: { x: -33, z: -9.5, rotY: faceToward(-33, -9.5, C.x, C.z + 2) },
    stall: { x: -23.4, z: -10.6, rotY: faceToward(-23.4, -10.6, C.x, C.z) },
    yard: { x: -24.5, z: -10.4, r: 6.5 },
  },
  bakery: {
    id: 'bakery',
    house: { x: -21.5, z: -40, rotY: faceToward(-21.5, -40, C.x, C.z) },
    stall: { x: -15.2, z: -31.8, rotY: faceToward(-15.2, -31.8, C.x, C.z) },
    yard: { x: -16, z: -33, r: 6 },
  },
  produce: {
    id: 'produce',
    house: { x: 0, z: -47.5, rotY: 0 },
    stall: { x: 0, z: -37.6, rotY: 0 },
    yard: { x: 0, z: -38.5, r: 6 },
  },
  dairy: {
    id: 'dairy',
    house: { x: 21.5, z: -40, rotY: faceToward(21.5, -40, C.x, C.z) },
    stall: { x: 15.2, z: -31.8, rotY: faceToward(15.2, -31.8, C.x, C.z) },
    yard: { x: 16, z: -33, r: 6 },
  },
  butcher: {
    id: 'butcher',
    house: { x: 33, z: -9.5, rotY: faceToward(33, -9.5, C.x, C.z + 2) },
    stall: { x: 23.4, z: -10.6, rotY: faceToward(23.4, -10.6, C.x, C.z) },
    yard: { x: 24.5, z: -10.4, r: 6.5 },
  },
};

export type HouseFamily = 'cottage' | 'twostorey' | 'timber';

export interface HouseSite {
  id: string;
  family: HouseFamily;
  x: number;
  z: number;
  rotY: number;
  roof: 'slate' | 'terracotta' | 'green';
  wall: 'cream' | 'white' | 'pink' | 'wood';
  /** Двор: полуширина/полуглубина забора вокруг дома и сторона калитки. */
  yard: { hw: number; hd: number };
  garden?: boolean;
}

export const HOUSES: HouseSite[] = [
  { id: 'H1', family: 'cottage', x: -42, z: -44, rotY: faceToward(-42, -44, -20, -26), roof: 'slate', wall: 'cream', yard: { hw: 9, hd: 8 }, garden: true },
  { id: 'H2', family: 'twostorey', x: 42, z: -44, rotY: faceToward(42, -44, 20, -26), roof: 'terracotta', wall: 'cream', yard: { hw: 9, hd: 8 } },
  { id: 'H3', family: 'cottage', x: -49, z: -9, rotY: Math.PI / 2, roof: 'slate', wall: 'white', yard: { hw: 8, hd: 8 }, garden: true },
  { id: 'H4', family: 'timber', x: -48, z: 24, rotY: faceToward(-48, 24, -30, 29), roof: 'slate', wall: 'cream', yard: { hw: 9, hd: 8 } },
  { id: 'H5', family: 'cottage', x: 49, z: -8, rotY: -Math.PI / 2, roof: 'terracotta', wall: 'cream', yard: { hw: 8, hd: 8 }, garden: true },
  { id: 'H6', family: 'timber', x: 44, z: 22, rotY: faceToward(44, 22, 22, 26), roof: 'slate', wall: 'white', yard: { hw: 9, hd: 8 } },
  { id: 'H7', family: 'twostorey', x: -20, z: 43, rotY: faceToward(-20, 43, -2, 40), roof: 'green', wall: 'cream', yard: { hw: 9, hd: 8 }, garden: true },
  { id: 'H8', family: 'cottage', x: 16, z: 45, rotY: faceToward(16, 45, -1, 44), roof: 'terracotta', wall: 'pink', yard: { hw: 8, hd: 7 } },
  { id: 'H9', family: 'cottage', x: -35, z: 8, rotY: faceToward(-35, 8, -18, 10), roof: 'slate', wall: 'cream', yard: { hw: 7.5, hd: 7 }, garden: true },
  { id: 'H10', family: 'twostorey', x: 35, z: 9, rotY: faceToward(35, 9, 19, 10), roof: 'slate', wall: 'white', yard: { hw: 8, hd: 7.5 } },
];

export const BUS_STOP = { x: -26.2, z: 15.2, rotY: faceToward(-26.2, 15.2, -20, 14) } as const;

/** Маршрут автобуса для интро: въезд с юга, остановка, выезд на юго-запад. */
export const BUS_ROUTE_IN: XZ[] = [
  [-3, 75],
  [-3, 57],
  [-2, 42],
  [0, 30.5],
  [-5, 29.5],
  [-14, 26],
  [-19.6, 20.2],
];
export const BUS_STOP_POINT: XZ = [-21.6, 18.0];
export const BUS_ROUTE_OUT: XZ[] = [
  [-21.6, 18.0],
  [-25, 23],
  [-30, 29],
  [-40, 41],
  [-50, 57],
  [-60, 72],
];

/** Где игрок выходит из автобуса и куда смотрит (на площадь). */
export const PLAYER_ARRIVAL = { x: -23.6, z: 16.4, lookX: -4, lookZ: -6 } as const;

/** Фонари вдоль дорог (кольцо площади добавляется отдельно). */
export const ROAD_LAMPS: XZ[] = [
  [-12.2, 4.5],
  [12.2, 4.5],
  [-18.2, 15.5],
  [17.4, 14],
  [-24.6, 21.8],
  [-6.5, 31.5],
  [8.5, 31.5],
  [-29, -20],
  [29, -20],
  [-7.2, -40],
  [7.2, -40],
  [-21.4, -6.2],
  [21.4, -6.2],
  [-3.6, 44],
  [23.6, 25],
];
