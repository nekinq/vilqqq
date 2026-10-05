import { ModelBuilder, type PartOptions } from '../ModelKit';
import { P } from '../palette';
import { defineAsset } from '../registry';

/** Пропсы деревни: фонари, скамейки, заборы, бордюры, ящики, бочки и прочее (MAP-03, SHOP-00). */

const iron: PartOptions = { mat: 'metal', color: P.iron };

defineAsset({
  id: 'street_lamp',
  name: 'Уличный фонарь',
  category: 'village',
  func: 'Освещение площади и дорог; ночью светится',
  ref: 'Map/MAP-03 (чугунные фонари), SHOP-01',
  collider: 'круг r=0.15',
  anims: 'эмиссив ночью',
  build: () => {
    const b = new ModelBuilder(401);
    b.cyl(0.16, 0.2, 0.35, 8, [0, 0.175, 0], iron);
    b.cyl(0.11, 0.14, 0.3, 8, [0, 0.5, 0], iron);
    b.cyl(0.05, 0.06, 2.6, 8, [0, 1.95, 0], iron, undefined);
    b.torus(0.07, 0.015, 4, 8, [0, 1.1, 0], iron, [Math.PI / 2, 0, 0]);
    b.cyl(0.08, 0.06, 0.12, 8, [0, 3.25, 0], iron);
    // Фонарь-«домик».
    b.cyl(0.13, 0.08, 0.06, 6, [0, 3.33, 0], iron);
    b.cyl(0.16, 0.12, 0.42, 6, [0, 3.58, 0], { mat: 'emissive', color: P.lampWarm, noShadow: true });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
      b.beam([Math.cos(a) * 0.125, 3.37, Math.sin(a) * 0.125], [Math.cos(a) * 0.165, 3.8, Math.sin(a) * 0.165], 0.012, 3, iron);
    }
    b.cone(0.24, 0.2, 6, [0, 3.9, 0], iron);
    b.sphere(0.04, 6, 4, [0, 4.02, 0], iron);
    b.marker('light', [0, 3.55, 0]);
    return b.build('street_lamp');
  },
});

defineAsset({
  id: 'bench',
  name: 'Скамейка',
  category: 'village',
  func: 'Площадь, крыльцо магазина, остановка',
  ref: 'Map/MAP-03, Shop/SHOP-00',
  collider: 'бокс 1.6×0.6',
  build: () => {
    const b = new ModelBuilder(402);
    const wood: PartOptions = { mat: 'woodgrain', color: P.woodLight, jitter: 0.06 };
    for (const z of [-0.15, 0, 0.15]) b.chamferBox([1.6, 0.05, 0.12], [0, 0.45, z], 0.01, wood);
    for (const y of [0.62, 0.78]) b.chamferBox([1.6, 0.1, 0.04], [0, y, 0.24], 0.01, wood, [-0.18, 0, 0]);
    for (const x of [-0.68, 0.68]) {
      b.box([0.06, 0.42, 0.06], [x, 0.21, -0.17], iron);
      b.box([0.06, 0.42, 0.06], [x, 0.21, 0.17], iron);
      b.box([0.06, 0.06, 0.46], [x, 0.4, 0], iron);
      b.box([0.05, 0.5, 0.05], [x, 0.68, 0.24], iron, [-0.18, 0, 0]);
      b.box([0.05, 0.05, 0.4], [x, 0.62, 0.02], iron);
    }
    return b.build('bench');
  },
});

defineAsset({
  id: 'bench_wood',
  name: 'Деревянная скамья',
  category: 'village',
  func: 'Крыльцо магазина, дворы',
  ref: 'Shop/SHOP-00 (скамья у окна)',
  collider: 'бокс 1.5×0.4',
  build: () => {
    const b = new ModelBuilder(403);
    const w: PartOptions = { mat: 'woodgrain', color: 0xa77443, jitter: 0.05 };
    b.chamferBox([1.5, 0.07, 0.38], [0, 0.45, 0], 0.015, w);
    for (const x of [-0.6, 0.6]) b.chamferBox([0.08, 0.42, 0.32], [x, 0.21, 0], 0.01, w);
    b.box([1.2, 0.05, 0.05], [0, 0.18, 0], w);
    return b.build('bench_wood');
  },
});

defineAsset({
  id: 'fence_post',
  name: 'Столб забора',
  category: 'village',
  func: 'Заборы дворов (инстансинг по линиям)',
  ref: 'Map/MAP-03 (жердевые заборы)',
  collider: 'линия забора',
  build: () => {
    const b = new ModelBuilder(404);
    b.chamferBox([0.12, 1.0, 0.12], [0, 0.5, 0], 0.015, { mat: 'woodgrain', color: 0x8a6440, jitter: 0.1 });
    b.cone(0.09, 0.08, 4, [0, 1.04, 0], { mat: 'woodgrain', color: 0x7e5a38 }, [0, Math.PI / 4, 0]);
    return b.build('fence_post');
  },
});

defineAsset({
  id: 'fence_rail',
  name: 'Жердь забора (1 м)',
  category: 'village',
  func: 'Масштабируется по длине пролёта',
  ref: 'Map/MAP-03',
  collider: 'линия забора',
  build: () => {
    const b = new ModelBuilder(405);
    // Две жерди длиной 1 м по оси X; растягиваются по X при расстановке.
    b.box([1, 0.08, 0.05], [0, 0.42, 0], { mat: 'woodgrain', color: 0x9c7348, uvScale: 0.5 });
    b.box([1, 0.08, 0.05], [0, 0.78, 0], { mat: 'woodgrain', color: 0x9c7348, uvScale: 0.5 });
    return b.build('fence_rail');
  },
});

defineAsset({
  id: 'picket',
  name: 'Штакетина',
  category: 'village',
  func: 'Палисадники (инстансинг)',
  ref: 'Map/MAP-03',
  collider: 'линия забора',
  build: () => {
    const b = new ModelBuilder(406);
    b.extrude(
      [
        [-0.045, 0],
        [0.045, 0],
        [0.045, 0.82],
        [0, 0.9],
        [-0.045, 0.82],
      ],
      0.025,
      [0, 0, 0],
      { mat: 'woodgrain', color: 0xeae2cf, jitter: 0.04 },
    );
    return b.build('picket');
  },
});

defineAsset({
  id: 'stone_border',
  name: 'Камень бордюра',
  category: 'village',
  func: 'Бордюры клумб и площади (инстансинг по кругу)',
  ref: 'Map/MAP-03 (каменные бордюры клумб)',
  collider: 'нет',
  build: () => {
    const b = new ModelBuilder(407);
    b.chamferBox([0.48, 0.26, 0.3], [0, 0.11, 0], 0.06, { mat: 'stone', color: 0xbdb4a6, uvScale: 0.6, faceJitter: 0.05, ao: 0.2 });
    return b.build('stone_border');
  },
});

defineAsset({
  id: 'planter',
  name: 'Кадка с цветами',
  category: 'village',
  func: 'Двор магазина, площадь, крыльцо',
  ref: 'Shop/SHOP-00 (вазоны у входа)',
  collider: 'круг r=0.35',
  build: () => {
    const b = new ModelBuilder(408);
    b.lathe(
      [
        [0.0, 0],
        [0.24, 0],
        [0.3, 0.38],
        [0.33, 0.42],
        [0.28, 0.44],
        [0, 0.44],
      ],
      12,
      [0, 0, 0],
      { color: 0xb5643f, smooth: false },
    );
    b.cyl(0.26, 0.26, 0.04, 12, [0, 0.42, 0], { color: P.soil });
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      b.ico(0.13, 0, [Math.cos(a) * 0.14, 0.52, Math.sin(a) * 0.14], { mat: 'foliageStatic', color: P.leaf, faceJitter: 0.1, ao: 0.3 }, [1, 0.8, 1]);
      b.ico(0.055, 0, [Math.cos(a) * 0.17, 0.62, Math.sin(a) * 0.17], { color: i % 2 ? P.white : 0xf2c94c, noShadow: true });
    }
    b.ico(0.12, 0, [0, 0.62, 0], { mat: 'foliageStatic', color: P.leafDark, faceJitter: 0.1 });
    return b.build('planter');
  },
});

defineAsset({
  id: 'flower_basket',
  name: 'Подвесное кашпо',
  category: 'village',
  func: 'Декор крыльца магазина (уровень 3)',
  ref: 'Shop/SHOP-00 (кашпо у столба)',
  collider: 'нет',
  build: () => {
    const b = new ModelBuilder(409);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      b.beam([0, 0, 0], [Math.cos(a) * 0.2, -0.45, Math.sin(a) * 0.2], 0.006, 3, iron);
    }
    b.dome(0.24, 10, 4, [0, -0.45, 0], { mat: 'woodgrain', color: 0x8a6440 }, [1, -0.9, 1]);
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      b.ico(0.1, 0, [Math.cos(a) * 0.16, -0.4 + (i % 2) * 0.05, Math.sin(a) * 0.16], { mat: 'foliageStatic', color: P.leaf, faceJitter: 0.1 });
      b.ico(0.05, 0, [Math.cos(a) * 0.2, -0.33, Math.sin(a) * 0.2], { color: i % 3 ? P.white : 0xf2c94c, noShadow: true });
    }
    return b.build('flower_basket');
  },
});

defineAsset({
  id: 'crate',
  name: 'Деревянный ящик',
  category: 'village',
  func: 'Прилавки поставщиков, двор магазина',
  ref: 'Map/MAP-03',
  collider: 'бокс 0.6×0.4',
  build: () => {
    const b = new ModelBuilder(410);
    const w: PartOptions = { mat: 'woodgrain', color: 0xb98d5c, jitter: 0.06 };
    for (const y of [0.06, 0.2, 0.34]) {
      b.box([0.6, 0.1, 0.03], [0, y, 0.2], w);
      b.box([0.6, 0.1, 0.03], [0, y, -0.2], w);
      b.box([0.03, 0.1, 0.37], [0.29, y, 0], w);
      b.box([0.03, 0.1, 0.37], [-0.29, y, 0], w);
    }
    b.box([0.56, 0.02, 0.37], [0, 0.01, 0], w);
    for (const x of [-0.27, 0.27]) for (const z of [-0.18, 0.18]) b.box([0.05, 0.4, 0.05], [x, 0.2, z], { mat: 'woodgrain', color: 0x9a7048 });
    return b.build('crate');
  },
});

defineAsset({
  id: 'barrel',
  name: 'Бочка',
  category: 'village',
  func: 'Декор дворов, бакалея',
  ref: 'Map/MAP-03',
  collider: 'круг r=0.3',
  build: () => {
    const b = new ModelBuilder(411);
    b.lathe(
      [
        [0, 0],
        [0.26, 0],
        [0.31, 0.2],
        [0.33, 0.4],
        [0.31, 0.6],
        [0.26, 0.8],
        [0, 0.8],
      ],
      12,
      [0, 0, 0],
      { mat: 'wood', color: 0x9a6a40, uvScale: 0.4, smooth: false },
    );
    for (const y of [0.12, 0.68]) b.torus(0.305, 0.018, 4, 14, [0, y, 0], iron, [Math.PI / 2, 0, 0]);
    b.torus(0.335, 0.018, 4, 14, [0, 0.4, 0], iron, [Math.PI / 2, 0, 0]);
    return b.build('barrel');
  },
});

defineAsset({
  id: 'milk_can',
  name: 'Молочный бидон',
  category: 'village',
  func: 'Молочная ферма',
  ref: 'Map/MAP-03 (бидоны)',
  collider: 'круг r=0.2',
  build: () => {
    const b = new ModelBuilder(412);
    b.lathe(
      [
        [0, 0],
        [0.17, 0],
        [0.18, 0.05],
        [0.18, 0.42],
        [0.13, 0.52],
        [0.09, 0.56],
        [0.09, 0.66],
        [0.11, 0.68],
        [0, 0.7],
      ],
      14,
      [0, 0, 0],
      { mat: 'chrome', color: P.steel },
    );
    b.torus(0.06, 0.012, 4, 8, [0.15, 0.56, 0], { mat: 'chrome', color: P.steel }, [0, Math.PI / 2, 0]);
    b.torus(0.06, 0.012, 4, 8, [-0.15, 0.56, 0], { mat: 'chrome', color: P.steel }, [0, Math.PI / 2, 0]);
    return b.build('milk_can');
  },
});

defineAsset({
  id: 'sack',
  name: 'Мешок (мука/зерно)',
  category: 'village',
  func: 'Бакалея, амбар',
  ref: 'Map/MAP-03 (мешки у бакалеи)',
  collider: 'нет',
  build: () => {
    const b = new ModelBuilder(413);
    b.chamferBox([0.42, 0.55, 0.3], [0, 0.27, 0], 0.09, { mat: 'fabric', color: 0xe6d6b4, faceJitter: 0.03 });
    b.ico(0.12, 0, [0, 0.6, 0], { mat: 'fabric', color: 0xd9c8a4 }, [1.6, 0.6, 1]);
    b.box([0.2, 0.12, 0.005], [0, 0.3, 0.153], { color: 0x2f7f78, noShadow: true });
    return b.build('sack');
  },
});

defineAsset({
  id: 'woodpile',
  name: 'Поленница',
  category: 'village',
  func: 'Дворы домов',
  ref: 'Map/MAP-03',
  collider: 'бокс 1.6×0.5',
  build: () => {
    const b = new ModelBuilder(414);
    const rng = b.rng;
    for (let row = 0; row < 4; row++) {
      for (let i = 0; i < 9 - (row % 2); i++) {
        const x = -0.72 + i * 0.18 + (row % 2) * 0.09;
        b.cyl(0.085, 0.085, 0.5, 6, [x, 0.09 + row * 0.16, 0], { mat: 'woodgrain', color: rng.chance(0.5) ? 0x9c7046 : 0xb08356, jitter: 0.1 }, [Math.PI / 2, 0, rng.range(0, 1)]);
      }
    }
    b.box([1.8, 0.06, 0.65], [0, 0.82, 0], { mat: 'wood', color: 0x6e5040 }, [0.12, 0, 0]);
    return b.build('woodpile');
  },
});

defineAsset({
  id: 'sign_post',
  name: 'Указатель',
  category: 'village',
  func: 'Указатели к поставщикам',
  ref: 'бриф',
  collider: 'круг r=0.1',
  build: () => {
    const b = new ModelBuilder(415);
    b.box([0.1, 1.9, 0.1], [0, 0.95, 0], { mat: 'woodgrain', color: 0x8a6440 });
    b.plane(0.9, 0.45, [0, 1.6, 0.056], { mat: 'sign:village' });
    b.box([0.94, 0.49, 0.06], [0, 1.6, 0.02], { mat: 'woodgrain', color: 0x7e5a38 });
    return b.build('sign_post');
  },
});

defineAsset({
  id: 'mailbox',
  name: 'Почтовый ящик',
  category: 'village',
  func: 'Калитки домов',
  ref: 'бриф',
  collider: 'нет',
  build: () => {
    const b = new ModelBuilder(416);
    b.box([0.08, 1.0, 0.08], [0, 0.5, 0], { mat: 'woodgrain', color: 0x8a6440 });
    b.chamferBox([0.24, 0.24, 0.4], [0, 1.1, 0], 0.04, { mat: 'metal', color: 0x3d6b8a });
    b.box([0.02, 0.12, 0.06], [0.13, 1.22, -0.1], { color: 0xc0392b });
    return b.build('mailbox');
  },
});

defineAsset({
  id: 'clothesline',
  name: 'Бельевая верёвка',
  category: 'village',
  func: 'Жилые дворы (как на MAP-03)',
  ref: 'Map/MAP-03',
  collider: 'нет',
  build: () => {
    const b = new ModelBuilder(417);
    for (const x of [-1.6, 1.6]) {
      b.box([0.08, 1.9, 0.08], [x, 0.95, 0], { mat: 'woodgrain', color: 0x8a6440 });
      b.box([0.6, 0.06, 0.06], [x, 1.85, 0], { mat: 'woodgrain', color: 0x8a6440 });
    }
    b.box([3.2, 0.01, 0.01], [0, 1.82, 0.22], { color: 0xdddddd, noShadow: true });
    b.box([3.2, 0.01, 0.01], [0, 1.82, -0.22], { color: 0xdddddd, noShadow: true });
    const cloth = [0xffffff, 0x8fb3d9, 0xe58f8f, 0xf2d27a, 0xb2d69a];
    for (let i = 0; i < 5; i++) {
      b.box([0.4, 0.55, 0.01], [-1.1 + i * 0.55, 1.55, i % 2 ? 0.22 : -0.22], { mat: 'fabric', color: cloth[i]!, noShadow: false });
    }
    return b.build('clothesline');
  },
});

defineAsset({
  id: 'garden_bed_crops',
  name: 'Грядка с овощами',
  category: 'village',
  func: 'Огород огородника, дворы',
  ref: 'Map/MAP-03 (огород с грядками)',
  collider: 'нет',
  build: () => {
    const b = new ModelBuilder(418);
    b.box([1.0, 0.12, 5.6], [0, 0.06, 0], { color: 0x6e4c34 });
    const rng = b.rng;
    for (let i = 0; i < 12; i++) {
      const z = -2.5 + i * 0.45;
      const kind = Math.floor(i / 4);
      if (kind === 0) {
        // Капуста.
        b.ico(0.17, 1, [0, 0.2, z], { mat: 'foliageStatic', color: 0x9cc46a, faceJitter: 0.08, ao: 0.3 }, [1, 0.8, 1]);
      } else if (kind === 1) {
        // Морковная ботва.
        for (let k = 0; k < 3; k++) b.cone(0.04, 0.3, 4, [rng.range(-0.15, 0.15), 0.27, z + rng.range(-0.08, 0.08)], { mat: 'foliage', color: 0x5f9a3a });
      } else {
        // Помидорный куст с плодами.
        b.ico(0.18, 0, [0, 0.35, z], { mat: 'foliage', color: P.leafDark, faceJitter: 0.1 }, [0.8, 1.4, 0.8]);
        b.sphere(0.05, 6, 4, [0.1, 0.32, z + 0.05], { color: 0xd9412f, noShadow: true });
        b.sphere(0.045, 6, 4, [-0.08, 0.42, z - 0.04], { color: 0xd9412f, noShadow: true });
      }
    }
    return b.build('garden_bed_crops');
  },
});

defineAsset({
  id: 'wheelbarrow',
  name: 'Тачка',
  category: 'village',
  func: 'Огороды',
  ref: 'бриф',
  collider: 'нет',
  build: () => {
    const b = new ModelBuilder(419);
    b.extrude(
      [
        [-0.4, 0],
        [0.4, 0],
        [0.55, 0.32],
        [-0.55, 0.32],
      ],
      0.55,
      [0, 0.35, 0],
      { mat: 'metal', color: 0x4e8b3a },
    );
    b.cyl(0.16, 0.16, 0.08, 10, [0.55, 0.16, 0], { color: P.black }, [Math.PI / 2, 0, 0]);
    for (const z of [-0.2, 0.2]) {
      b.beam([0.45, 0.3, z], [-1.0, 0.55, z * 1.3], 0.02, 5, { mat: 'woodgrain', color: 0x8a6440 });
      b.beam([-0.3, 0.3, z], [-0.3, 0.0, z], 0.02, 5, iron);
    }
    return b.build('wheelbarrow');
  },
});
