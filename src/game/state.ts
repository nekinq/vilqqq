import type { ProductId, LicenseId, SupplierId } from '../data/products';
import type { FurnitureType } from '../data/equipment';
import type { DirtKind } from '../data/progression';
import { PRODUCTS, PRODUCT_IDS } from '../data/products';
import { BALANCE } from '../data/balance';
import { REP } from '../data/progression';

/**
 * Полное сериализуемое состояние игры. Никаких объектов three.js — только данные.
 * Сохранение = JSON этого объекта; загрузка = восстановление + пересборка вида.
 */

export const SAVE_VERSION = 1;

export type Phase = 'preparation' | 'open' | 'closing' | 'report';

export interface SectionState {
  sku: ProductId | null;
  /** Логический сток на полке (принадлежит магазину). */
  count: number;
  /** Зарезервировано покупателями, которые идут к полке. */
  reserved: number;
}

export type BoxLoc =
  | { kind: 'delivery'; slot: number }
  | { kind: 'rack'; furnitureId: string; slot: number }
  | { kind: 'floor'; x: number; y: number; z: number; rotY: number }
  | { kind: 'held' };

export interface BoxState {
  id: string;
  sku: ProductId | null;
  count: number;
  open: boolean;
  loc: BoxLoc;
}

export interface FurnitureState {
  id: string;
  type: FurnitureType;
  x: number;
  z: number;
  /** Поворот, кратный 90° (радианы). */
  rotY: number;
}

export interface DirtItem {
  id: string;
  kind: DirtKind;
  x: number;
  y: number;
  z: number;
  rot: number;
  /** 1 — свежая грязь, 0 — убрана. */
  strength: number;
}

export type BoardState = 'nailed' | 'loose' | 'held' | 'disposed';
export type WasteState = 'placed' | 'held' | 'disposed';

export interface LooseItem {
  x: number;
  y: number;
  z: number;
  rotY: number;
}

export interface RestorationState {
  boards: BoardState[];
  boardPos: (LooseItem | null)[];
  webs: boolean[];
  waste: WasteState[];
  wastePos: (LooseItem | null)[];
  stains: number[];
  completedDay: number | null;
}

export interface DayLedger {
  day: number;
  openingBalance: number;
  revenue: number;
  costOfGoodsSold: number;
  productPurchases: number;
  equipmentPurchases: number;
  licensePurchases: number;
  hireFees: number;
  wages: number;
  xp: number;
  reputationStart: number;
  reputationEnd: number;
  cleanlinessEnd: number;
  customersVisited: number;
  customersServed: number;
  itemsSold: number;
  closingBalance: number;
}

export type CustomerPhase =
  | 'arriving'
  | 'entering'
  | 'shopping'
  | 'toShelf'
  | 'picking'
  | 'toQueue'
  | 'queue'
  | 'placing'
  | 'waitScan'
  | 'paying'
  | 'leaving'
  | 'refused'
  | 'gone';

export interface CartItem {
  sku: ProductId;
  price: number;
}

export interface WantItem {
  sku: ProductId;
  qty: number;
  /** Итог по позиции: взял / нет товара / дорого / ещё не решено. */
  result: 'pending' | 'taken' | 'missing' | 'expensive' | 'partial';
  taken: number;
}

export interface CustomerState {
  id: string;
  archetype: string;
  seed: number;
  phase: CustomerPhase;
  x: number;
  y: number;
  z: number;
  rotY: number;
  wants: WantItem[];
  cart: CartItem[];
  /** Секция, к которой идёт (с резервом). */
  target: { section: string; qty: number; sku: ProductId } | null;
  queueIndex: number;
  patience: number;
  complained: boolean;
  spawnX: number;
  spawnZ: number;
  payMethod: 'card' | 'cash';
  /** Сумма, которую покупатель даст наличными. */
  cashGiven: number;
  timer: number;
}

export interface CheckoutState {
  customerId: string;
  items: { uid: number; sku: ProductId; price: number; scanned: boolean }[];
  stage: 'placing' | 'scanning' | 'payment' | 'done';
  method: 'card' | 'cash';
  cashGiven: number;
  cashTaken: boolean;
  drawerOpen: boolean;
  change: number[];
  cardConfirmed: boolean;
  operator: 'player' | 'cashier' | null;
}

export type HeldState =
  | { kind: 'none' }
  | { kind: 'box'; boxId: string }
  | { kind: 'scanner' }
  | { kind: 'boards'; indices: number[] }
  | { kind: 'trash'; indices: number[] }
  | { kind: 'cash'; amount: number };

export interface TutorialState {
  step: number;
  done: boolean;
  rewarded: boolean;
  priceChecked: boolean;
  shelfBought: boolean;
  shelfPlaced: boolean;
  orders: ProductId[];
  stocked: ProductId[];
  firstSale: boolean;
  reachedShop: boolean;
}

export interface StoryState {
  introDone: boolean;
  callDone: boolean;
  ending: { streak: number; done: boolean };
}

export interface GameState {
  version: number;
  createdAt: number;
  playTimeSec: number;
  seed: number;
  rngState: number;
  nextId: number;
  day: number;
  phase: Phase;
  minutes: number;
  /** Защита от двойного старта нового дня. */
  dayToken: number;
  money: number;
  xp: number;
  level: number;
  reputation: number;
  licenses: LicenseId[];
  cashierHired: boolean;
  prices: Record<ProductId, number>;
  everStocked: ProductId[];
  furniture: FurnitureState[];
  pendingFurniture: FurnitureType[];
  sections: Record<string, SectionState>;
  boxes: BoxState[];
  restoration: RestorationState;
  dirt: DirtItem[];
  suppliersMet: SupplierId[];
  tutorial: TutorialState;
  story: StoryState;
  ledger: DayLedger;
  history: DayLedger[];
  customers: CustomerState[];
  director: { plan: number[]; spawned: number; total: number; refused: number };
  queue: string[];
  checkout: CheckoutState | null;
  player: { x: number; y: number; z: number; yaw: number; pitch: number; held: HeldState; tool: 'hands' | 'broom' };
  totals: { customers: number; sales: number; revenue: number };
}

export function emptyLedger(day: number, money: number, rep: number): DayLedger {
  return {
    day,
    openingBalance: money,
    revenue: 0,
    costOfGoodsSold: 0,
    productPurchases: 0,
    equipmentPurchases: 0,
    licensePurchases: 0,
    hireFees: 0,
    wages: 0,
    xp: 0,
    reputationStart: rep,
    reputationEnd: rep,
    cleanlinessEnd: 100,
    customersVisited: 0,
    customersServed: 0,
    itemsSold: 0,
    closingBalance: money,
  };
}

export function newGameState(seed = (Date.now() & 0x7fffffff) >>> 0): GameState {
  const prices = {} as Record<ProductId, number>;
  for (const id of PRODUCT_IDS) prices[id] = PRODUCTS[id].defaultSellPrice;
  return {
    version: SAVE_VERSION,
    createdAt: Date.now(),
    playTimeSec: 0,
    seed,
    rngState: seed || 1,
    nextId: 1,
    day: 1,
    phase: 'preparation',
    minutes: BALANCE.dayStart,
    dayToken: 1,
    money: BALANCE.startMoney,
    xp: 0,
    level: 1,
    reputation: REP.start,
    licenses: [],
    cashierHired: false,
    prices,
    everStocked: [],
    furniture: [],
    pendingFurniture: [],
    sections: {},
    boxes: [],
    restoration: {
      boards: ['nailed', 'nailed', 'nailed', 'nailed', 'nailed', 'nailed'],
      boardPos: [null, null, null, null, null, null],
      webs: [false, false, false, false],
      waste: ['placed', 'placed', 'placed', 'placed'],
      wastePos: [null, null, null, null],
      stains: [1, 1, 1, 1],
      completedDay: null,
    },
    dirt: [],
    suppliersMet: [],
    tutorial: {
      step: 0,
      done: false,
      rewarded: false,
      priceChecked: false,
      shelfBought: false,
      shelfPlaced: false,
      orders: [],
      stocked: [],
      firstSale: false,
      reachedShop: false,
    },
    story: { introDone: false, callDone: false, ending: { streak: 0, done: false } },
    ledger: emptyLedger(1, BALANCE.startMoney, REP.start),
    history: [],
    customers: [],
    director: { plan: [], spawned: 0, total: 0, refused: 0 },
    queue: [],
    checkout: null,
    player: { x: -23.6, y: 0, z: 16.4, yaw: 0, pitch: 0, held: { kind: 'none' }, tool: 'hands' },
    totals: { customers: 0, sales: 0, revenue: 0 },
  };
}

export function sectionKey(furnitureId: string, index: number): string {
  return `${furnitureId}#${index}`;
}

export function parseSectionKey(key: string): { furnitureId: string; index: number } {
  const i = key.lastIndexOf('#');
  return { furnitureId: key.slice(0, i), index: Number(key.slice(i + 1)) };
}

/** Генератор стабильных id внутри состояния (сохраняется в сейв). */
export function nextId(state: GameState, prefix: string): string {
  const id = `${prefix}${state.nextId}`;
  state.nextId++;
  return id;
}
