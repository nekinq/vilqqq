import type { ProductId, SupplierId } from './products';

/** Поставщики, продавцы и их реплики (Docs/Planning/VillageRevamp/StoryTutorial.md). */

export interface SupplierDef {
  id: SupplierId;
  title: string;
  vendorName: string;
  /** Персонаж-модель продавца. */
  characterId: string;
  products: ProductId[];
  /** Подсказка, где искать (для планшета). */
  where: string;
  firstMeet: string[];
  greetings: string[];
  icon: string;
}

export const SUPPLIERS: Record<SupplierId, SupplierDef> = {
  grocery: {
    id: 'grocery',
    title: 'Бакалея',
    vendorName: 'Фёдор Ильич',
    characterId: 'char_grocer',
    products: ['water', 'flour', 'pasta', 'canned'],
    where: 'Бирюзовый дом к западу от площади',
    firstMeet: [
      'Ты от Нины Петровны? Вот радость! Я Фёдор Ильич, держу бакалею.',
      'Воду продам хоть сейчас, а муку, макароны и консервы — как оформишь лицензию бакалеи.',
      'Привезу коробки к твоему навесу — доставка включена.',
    ],
    greetings: ['Здравствуй! Что сегодня берём?', 'О, сосед! Воды подкинуть?', 'Добрый день. Товар свежий, цены честные.'],
    icon: 'bottle',
  },
  bakery: {
    id: 'bakery',
    title: 'Пекарня',
    vendorName: 'Марина',
    characterId: 'char_baker',
    products: ['bread', 'buns'],
    where: 'Дом с красной крышей и полосатым тентом, северо-запад',
    firstMeet: [
      'Привет! Я Марина, пеку с пяти утра — чувствуешь запах?',
      'Хлеб бери уже сегодня, а булочки — когда будет лицензия пекарни.',
      'Коробки с хлебом привезу прямо к магазину.',
    ],
    greetings: ['Привет! Хлеб ещё тёплый.', 'Как торговля? Булочки разлетаются!', 'Заходи, всё свежее.'],
    icon: 'bread',
  },
  produce: {
    id: 'produce',
    title: 'Овощи',
    vendorName: 'Степан',
    characterId: 'char_farmer',
    products: ['apples', 'tomatoes', 'carrots'],
    where: 'Огород с теплицей к северу от площади',
    firstMeet: [
      'Здорово! Степан, огородник. Яблоки у меня свои, хрустящие.',
      'Помидоры с морковкой — когда оформишь лицензию на овощи.',
      'Ящики довезу до твоего навеса.',
    ],
    greetings: ['Здорово! Яблочки сегодня — загляденье.', 'Урожай что надо!', 'Чего желаешь?'],
    icon: 'carrot',
  },
  dairy: {
    id: 'dairy',
    title: 'Молочная ферма',
    vendorName: 'Тётя Валя',
    characterId: 'char_dairy',
    products: ['milk', 'cheese', 'yogurt', 'butter', 'condensed_milk'],
    where: 'Ферма с хлевом и коровами, северо-восток',
    firstMeet: [
      'Ой, это же Нинино солнышко! Я Валентина, можно просто тётя Валя.',
      'Молочку продам, но для неё нужен холодильник и молочная лицензия.',
      'А сгущёнку можно и на обычную полку.',
    ],
    greetings: ['Здравствуй, солнышко! Молочко с утра.', 'Коровки сегодня в настроении!', 'Чего тебе, дорогое?'],
    icon: 'milk',
  },
  butcher: {
    id: 'butcher',
    title: 'Мясная лавка',
    vendorName: 'Борис',
    characterId: 'char_butcher',
    products: ['sausage', 'chicken', 'steaks'],
    where: 'Дом с бордовыми тентами к востоку от площади',
    firstMeet: [
      'Борис. Мясо, колбаса, курица.',
      'Нужна мясная лицензия, а для стейков — морозильник.',
      'Подрастёшь — приходи. Привезу к навесу.',
    ],
    greetings: ['Здорово.', 'Мясо сегодня отличное.', 'Слушаю.'],
    icon: 'meat',
  },
};

export const SUPPLIER_ORDER: SupplierId[] = ['grocery', 'bakery', 'produce', 'dairy', 'butcher'];
