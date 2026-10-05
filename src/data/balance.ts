/** Прочие константы баланса и времени. */
export const BALANCE = {
  startMoney: 350,
  deliverySlots: 12,
  /** Время: подготовка в 08:00, смена до 23:00, 1 с = 1 игровая минута. */
  dayStart: 8 * 60,
  dayEnd: 23 * 60,
  minutesPerSecond: 1,
  priceMin: 1,
  priceMax: 9999,
  /** Раскладка единицы товара, с. */
  stockAnimSec: 0.8,
  /** Дальность взаимодействия, м. */
  reach: 2.6,
  /** Радиус уборки от щётки, м. */
  broomRadius: 0.95,
  /** Максимум вылета щётки от игрока, м. */
  broomReach: 1.7,
  /** Удержание ЛКМ для снятия доски, с. */
  boardHoldSec: 2.0,
  /** Сколько досок/мешков можно нести одновременно. */
  carryBoards: 3,
  carryTrash: 2,
  /** Терпение покупателя в очереди, с. */
  queuePatience: 110,
  maxDirtDecals: 60,
  autosaveSec: 600,
} as const;

/** Номиналы для сдачи. */
export const DENOMINATIONS = [100, 50, 20, 10, 5, 2, 1] as const;
