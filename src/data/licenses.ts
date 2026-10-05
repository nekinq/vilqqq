import type { LicenseId } from './products';

/** Лицензии: уровень только открывает возможность покупки. */
export interface LicenseDef {
  id: LicenseId;
  title: string;
  level: number;
  price: number;
  unlocks: string;
}

export const LICENSES: Record<LicenseId, LicenseDef> = {
  bakery: { id: 'bakery', title: 'Пекарня', level: 2, price: 100, unlocks: 'булочки' },
  produce: { id: 'produce', title: 'Овощи', level: 2, price: 100, unlocks: 'помидоры, морковь' },
  grocery: { id: 'grocery', title: 'Бакалея', level: 2, price: 150, unlocks: 'мука, макароны, консервы' },
  dairy: { id: 'dairy', title: 'Молочная', level: 3, price: 220, unlocks: 'сгущёнка, молоко, сыр, йогурт, масло' },
  meat: { id: 'meat', title: 'Мясная', level: 4, price: 300, unlocks: 'колбаса, курица, стейки' },
};

export const LICENSE_ORDER: LicenseId[] = ['bakery', 'produce', 'grocery', 'dairy', 'meat'];
