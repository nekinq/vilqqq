/** Каталог товаров (Docs/Planning/VillageRevamp/EconomyProgression.md). */

export type ProductId =
  | 'bread'
  | 'water'
  | 'apples'
  | 'flour'
  | 'pasta'
  | 'canned'
  | 'buns'
  | 'tomatoes'
  | 'carrots'
  | 'condensed_milk'
  | 'milk'
  | 'cheese'
  | 'yogurt'
  | 'butter'
  | 'sausage'
  | 'chicken'
  | 'steaks';

export type StorageType = 'ambient' | 'chilled' | 'frozen';
export type SupplierId = 'grocery' | 'bakery' | 'produce' | 'dairy' | 'butcher';
export type LicenseId = 'bakery' | 'produce' | 'grocery' | 'dairy' | 'meat';

export interface ProductDef {
  id: ProductId;
  name: string;
  /** Короткое имя для ценника. */
  short: string;
  supplierId: SupplierId;
  storage: StorageType;
  wholesalePrice: number;
  defaultSellPrice: number;
  licenseId: LicenseId | null;
  modelId: string;
  boxSize: number;
  /** Популярность у покупателей (вес выбора в список покупок). */
  popularity: number;
  /** Цвет полосы на коробке и в UI. */
  color: string;
}

export const BOX_SIZE = 8;

const P = (d: Omit<ProductDef, 'boxSize' | 'modelId'> & { modelId?: string }): ProductDef => ({ boxSize: BOX_SIZE, modelId: `prod_${d.id}`, ...d });

export const PRODUCTS: Record<ProductId, ProductDef> = {
  bread: P({ id: 'bread', name: 'Хлеб', short: 'Хлеб', supplierId: 'bakery', storage: 'ambient', wholesalePrice: 4, defaultSellPrice: 7, licenseId: null, popularity: 1.4, color: '#c98a45' }),
  water: P({ id: 'water', name: 'Вода', short: 'Вода', supplierId: 'grocery', storage: 'ambient', wholesalePrice: 3, defaultSellPrice: 5, licenseId: null, popularity: 1.2, color: '#4a9fd6' }),
  apples: P({ id: 'apples', name: 'Яблоки', short: 'Яблоки', supplierId: 'produce', storage: 'ambient', wholesalePrice: 2, defaultSellPrice: 4, licenseId: null, popularity: 1.1, color: '#d2402e' }),
  flour: P({ id: 'flour', name: 'Мука', short: 'Мука', supplierId: 'grocery', storage: 'ambient', wholesalePrice: 5, defaultSellPrice: 9, licenseId: 'grocery', popularity: 0.7, color: '#d9c9a3' }),
  pasta: P({ id: 'pasta', name: 'Макароны', short: 'Макароны', supplierId: 'grocery', storage: 'ambient', wholesalePrice: 4, defaultSellPrice: 7, licenseId: 'grocery', popularity: 0.9, color: '#e8c24a' }),
  canned: P({ id: 'canned', name: 'Консервы', short: 'Консервы', supplierId: 'grocery', storage: 'ambient', wholesalePrice: 6, defaultSellPrice: 10, licenseId: 'grocery', popularity: 0.8, color: '#b84a3a' }),
  buns: P({ id: 'buns', name: 'Булочки', short: 'Булочки', supplierId: 'bakery', storage: 'ambient', wholesalePrice: 3, defaultSellPrice: 6, licenseId: 'bakery', popularity: 1.0, color: '#e2a456' }),
  tomatoes: P({ id: 'tomatoes', name: 'Помидоры', short: 'Помидоры', supplierId: 'produce', storage: 'ambient', wholesalePrice: 3, defaultSellPrice: 6, licenseId: 'produce', popularity: 0.9, color: '#e2492f' }),
  carrots: P({ id: 'carrots', name: 'Морковь', short: 'Морковь', supplierId: 'produce', storage: 'ambient', wholesalePrice: 2, defaultSellPrice: 4, licenseId: 'produce', popularity: 0.8, color: '#f08a2b' }),
  condensed_milk: P({ id: 'condensed_milk', name: 'Сгущёнка', short: 'Сгущёнка', supplierId: 'dairy', storage: 'ambient', wholesalePrice: 5, defaultSellPrice: 9, licenseId: 'dairy', popularity: 0.6, color: '#3d6b8a' }),
  milk: P({ id: 'milk', name: 'Молоко', short: 'Молоко', supplierId: 'dairy', storage: 'chilled', wholesalePrice: 4, defaultSellPrice: 7, licenseId: 'dairy', popularity: 1.2, color: '#8fbfe0' }),
  cheese: P({ id: 'cheese', name: 'Сыр', short: 'Сыр', supplierId: 'dairy', storage: 'chilled', wholesalePrice: 9, defaultSellPrice: 15, licenseId: 'dairy', popularity: 0.7, color: '#f0c64a' }),
  yogurt: P({ id: 'yogurt', name: 'Йогурт', short: 'Йогурт', supplierId: 'dairy', storage: 'chilled', wholesalePrice: 3, defaultSellPrice: 6, licenseId: 'dairy', popularity: 0.8, color: '#e7a6c4' }),
  butter: P({ id: 'butter', name: 'Масло', short: 'Масло', supplierId: 'dairy', storage: 'chilled', wholesalePrice: 6, defaultSellPrice: 10, licenseId: 'dairy', popularity: 0.7, color: '#f4e07a' }),
  sausage: P({ id: 'sausage', name: 'Колбаса', short: 'Колбаса', supplierId: 'butcher', storage: 'chilled', wholesalePrice: 8, defaultSellPrice: 14, licenseId: 'meat', popularity: 0.8, color: '#9a3a2e' }),
  chicken: P({ id: 'chicken', name: 'Курица', short: 'Курица', supplierId: 'butcher', storage: 'chilled', wholesalePrice: 12, defaultSellPrice: 20, licenseId: 'meat', popularity: 0.6, color: '#e8b48a' }),
  steaks: P({ id: 'steaks', name: 'Стейки', short: 'Стейки', supplierId: 'butcher', storage: 'frozen', wholesalePrice: 15, defaultSellPrice: 25, licenseId: 'meat', popularity: 0.5, color: '#b8443a' }),
};

export const PRODUCT_IDS = Object.keys(PRODUCTS) as ProductId[];

export const STORAGE_LABEL: Record<StorageType, string> = {
  ambient: 'Обычное',
  chilled: 'Холод',
  frozen: 'Заморозка',
};

export function boxPrice(id: ProductId): number {
  const p = PRODUCTS[id];
  return p.wholesalePrice * p.boxSize;
}
