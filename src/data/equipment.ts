import type { StorageType } from './products';

/** Оборудование магазина. Размеры — габарит основания (м) при повороте 0 (ширина по X, глубина по Z). */
export type FurnitureType = 'shelf' | 'storage_rack' | 'fridge' | 'freezer';

export interface FurnitureDef {
  type: FurnitureType;
  title: string;
  price: number;
  level: number;
  /** Число секций (для торговых) и мест под коробки (для склада). */
  sections: number;
  boxSlots: number;
  storage: StorageType | null;
  w: number;
  d: number;
  h: number;
  max: number;
  modelId: string;
  /** Где можно ставить. */
  area: 'hall' | 'any';
  description: string;
}

export const FURNITURE: Record<FurnitureType, FurnitureDef> = {
  shelf: {
    type: 'shelf',
    title: 'Стеллаж',
    price: 180,
    level: 1,
    sections: 18,
    boxSlots: 0,
    storage: 'ambient',
    w: 2.5,
    d: 1.0,
    h: 1.75,
    max: 6,
    modelId: 'shelf_gondola',
    area: 'hall',
    description: 'Двусторонний: 18 секций по 8 штук. Обычное хранение.',
  },
  storage_rack: {
    type: 'storage_rack',
    title: 'Складской стеллаж',
    price: 100,
    level: 2,
    sections: 0,
    boxSlots: 8,
    storage: null,
    w: 2.0,
    d: 0.65,
    h: 2.0,
    max: 4,
    modelId: 'storage_rack',
    area: 'any',
    description: '8 мест для коробок. Можно поставить на складе.',
  },
  fridge: {
    type: 'fridge',
    title: 'Холодильник',
    price: 260,
    level: 3,
    sections: 8,
    boxSlots: 0,
    storage: 'chilled',
    w: 1.7,
    d: 0.85,
    h: 2.05,
    max: 3,
    modelId: 'fridge',
    area: 'hall',
    description: '8 секций по 8 штук. Для молочки, колбасы, курицы.',
  },
  freezer: {
    type: 'freezer',
    title: 'Морозильный ларь',
    price: 320,
    level: 4,
    sections: 4,
    boxSlots: 0,
    storage: 'frozen',
    w: 1.9,
    d: 0.95,
    h: 0.95,
    max: 2,
    modelId: 'freezer',
    area: 'hall',
    description: '4 секции по 8 штук. Для стейков.',
  },
};

export const FURNITURE_ORDER: FurnitureType[] = ['shelf', 'storage_rack', 'fridge', 'freezer'];
