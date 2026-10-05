import { ModelBuilder, type PartOptions } from '../ModelKit';
import { P } from '../palette';
import { defineAsset } from '../registry';
import { SHOP, FLOOR_Y, DELIVERY_PALLETS } from '../../world/shopLayout';
import { wallAlongX, wallAlongZ, windowX, windowZ, doorFrameX, doorFrameZ, doorLeaf, type Opening } from './buildingKit';
import { styledGableRoof, styledShedRoof, styledShedRoofZ, styledChimney } from './styleKit';

/**
 * Магазин бабушки: зал (B-SHOP), склад (B-WAREHOUSE), навес доставки (Z-DELIVERY), крыльцо.
 * Референсы: Docs/Visual/VillageRevamp/Shop/SHOP-00_restored_exterior.webp, SHOP-01_abandoned.webp.
 * Фасад смотрит в −Z (на площадь), пивот — центр зала на уровне земли.
 */

const F = FLOOR_Y;
const T = SHOP.wallT;
const H = SHOP.wallH;
const ext: PartOptions = { mat: 'wood', color: 0xc99260, uvScale: 1.1 };
const interior = {
  lower: { mat: 'wood', color: P.wainscot, uvScale: 0.55 } as PartOptions,
  upper: { mat: 'plaster', color: P.plaster, uvScale: 2 } as PartOptions,
  split: SHOP.wainscotH,
};
const trim = P.green;
const woodIn = 0xa77a50;

function buildShopShell(): ModelBuilder {
  const b = new ModelBuilder(101);
  const hall = SHOP.hall;

  // ── Фундамент и пол ──
  const plinth: PartOptions = { mat: 'stone', color: P.stone, uvScale: 1.2 };
  b.box([hall.x1 - hall.x0 + 0.1, F, hall.z1 - hall.z0 + 0.1], [0, F / 2, 0], plinth);
  b.box([SHOP.warehouse.x1 - SHOP.warehouse.x0, F, SHOP.warehouse.z1 - SHOP.warehouse.z0 + 0.1], [(SHOP.warehouse.x0 + SHOP.warehouse.x1) / 2 + 0.05, F / 2, (SHOP.warehouse.z0 + SHOP.warehouse.z1) / 2], plinth);
  // Пол зала — тёплые доски.
  b.box([hall.x1 - hall.x0 - 0.02, 0.04, hall.z1 - hall.z0 - 0.02], [0, F + 0.001 - 0.02, 0], { mat: 'wood', color: 0xc3915f, uvScale: 0.75, uvSwap: true });
  // Пол склада.
  const wh = SHOP.warehouse;
  b.box([wh.x1 - wh.x0 - 0.1, 0.04, wh.z1 - wh.z0 - 0.1], [(wh.x0 + wh.x1) / 2, F - 0.02, (wh.z0 + wh.z1) / 2], { mat: 'wood', color: 0xa98663, uvScale: 0.75 });

  // ── Стены зала ──
  const style = { ext, interior };
  const fd = SHOP.frontDoor;
  const frontOpenings: Opening[] = [
    { a: fd.x0, b: fd.x1, y0: 0, y1: fd.h },
    ...SHOP.frontWindows.map((w) => ({ a: w.x0, b: w.x1, y0: w.y0, y1: w.y1 })),
  ];
  wallAlongX(b, hall.z0, hall.x0 - T / 2, hall.x1 + T / 2, F, H, T, -1, frontOpenings, style);
  const bd = SHOP.backDoor;
  const bw = SHOP.backWindow;
  wallAlongX(b, hall.z1, hall.x0 - T / 2, hall.x1 + T / 2, F, H, T, 1, [
    { a: bd.x0, b: bd.x1, y0: 0, y1: bd.h },
    { a: bw.x0, b: bw.x1, y0: bw.y0, y1: bw.y1 },
  ], style);
  wallAlongZ(b, hall.x0, hall.z0 + T / 2, hall.z1 - T / 2, F, H, T, -1, SHOP.westWindows.map((w) => ({ a: w.z0, b: w.z1, y0: w.y0, y1: w.y1 })), style);
  const wd = SHOP.warehouseDoor;
  wallAlongZ(b, hall.x1, hall.z0 + T / 2, hall.z1 - T / 2, F, H, T, 1, [{ a: wd.z0, b: wd.z1, y0: 0, y1: wd.h }], style);

  // Угловые доски.
  for (const [x, z] of [
    [hall.x0, hall.z0],
    [hall.x1, hall.z0],
    [hall.x0, hall.z1],
    [hall.x1, hall.z1],
  ] as const) {
    const sx = Math.sign(x);
    const sz = Math.sign(z);
    b.box([0.06, H + 0.02, 0.24], [x + sx * (T / 2 + 0.03), F + H / 2, z - sz * 0.05], { mat: 'woodgrain', color: trim });
    b.box([0.24, H + 0.02, 0.06], [x - sx * 0.05, F + H / 2, z + sz * (T / 2 + 0.03)], { mat: 'woodgrain', color: trim });
  }
  // Пояс над цоколем снаружи.
  b.box([hall.x1 - hall.x0 + T + 0.08, 0.1, 0.05], [0, F + 0.05, hall.z1 + T / 2 + 0.025], { mat: 'woodgrain', color: trim });
  b.box([0.05, 0.1, hall.z1 - hall.z0 + T], [hall.x0 - T / 2 - 0.025, F + 0.05, 0], { mat: 'woodgrain', color: trim });

  // ── Окна и двери ──
  const winSt = { frame: trim, inner: woodIn, bars: [1, 1] as [number, number], sill: trim };
  for (const w of SHOP.frontWindows) windowX(b, (w.x0 + w.x1) / 2, hall.z0, T, -1, w.x1 - w.x0, F + w.y0, F + w.y1, { ...winSt, bars: [2, 1] });
  for (const w of SHOP.westWindows) windowZ(b, (w.z0 + w.z1) / 2, hall.x0, T, -1, w.z1 - w.z0, F + w.y0, F + w.y1, winSt);
  windowX(b, (bw.x0 + bw.x1) / 2, hall.z1, T, 1, bw.x1 - bw.x0, F + bw.y0, F + bw.y1, winSt);
  doorFrameX(b, (fd.x0 + fd.x1) / 2, hall.z0, T, -1, fd.x1 - fd.x0, F, fd.h, trim, woodIn);
  doorFrameX(b, (bd.x0 + bd.x1) / 2, hall.z1, T, 1, bd.x1 - bd.x0, F, bd.h, trim, woodIn);
  doorFrameZ(b, (wd.z0 + wd.z1) / 2, hall.x1, T, 1, wd.z1 - wd.z0, F, wd.h, woodIn, woodIn);
  // Фрамуга над входом.
  b.box([fd.x1 - fd.x0, 0.42, 0.02], [0, F + fd.h + 0.35, hall.z0], { mat: 'glass', noShadow: true });
  b.box([fd.x1 - fd.x0 + 0.3, 0.1, 0.06], [0, F + fd.h + 0.6, hall.z0 - T / 2 - 0.03], { mat: 'woodgrain', color: trim });
  b.box([0.06, 0.42, 0.06], [0, F + fd.h + 0.35, hall.z0], { mat: 'woodgrain', color: trim });

  // Двери (узлы — анимируются): двустворчатая входная, задняя, в склад.
  const dw = (fd.x1 - fd.x0) / 2 - 0.01;
  b.node('door_front_L', [fd.x0 + 0.01, F, hall.z0], [0, 0, 0], (nb) => doorLeaf(nb, dw, fd.h - 0.02, trim, 0.62, 1), { door: 'front', hinge: -1 });
  b.node('door_front_R', [fd.x1 - 0.01, F, hall.z0], [0, Math.PI, 0], (nb) => doorLeaf(nb, dw, fd.h - 0.02, trim, 0.62, 1), { door: 'front', hinge: 1 });
  b.node('door_back', [bd.x0 + 0.01, F, hall.z1], [0, 0, 0], (nb) => doorLeaf(nb, bd.x1 - bd.x0 - 0.02, bd.h - 0.02, trim, 0.4, 1), { door: 'back', hinge: -1 });
  b.node('door_wh', [hall.x1, F, wd.z1 - 0.01], [0, Math.PI / 2, 0], (nb) => doorLeaf(nb, wd.z1 - wd.z0 - 0.02, wd.h - 0.02, woodIn, 0, 1), { door: 'warehouse', hinge: 1 });

  // ── Интерьер: стойки, балки, потолок, лампы ──
  const inner = SHOP.hallInner;
  const ceilY = F + SHOP.ceilingH;
  b.box([inner.x1 - inner.x0, 0.06, inner.z1 - inner.z0], [0, ceilY + 0.03, 0], { mat: 'plaster', color: 0xf1e8d6, uvScale: 2, noShadow: true });
  const beam: PartOptions = { mat: 'woodgrain', color: 0x96643c };
  for (const z of [-2.75, 0, 2.75]) {
    b.box([inner.x1 - inner.x0, 0.24, 0.2], [0, ceilY - 0.12, z], beam);
  }
  b.box([0.2, 0.2, inner.z1 - inner.z0], [0, ceilY - 0.34, 0], beam);
  // Обвязка по периметру под потолком.
  b.box([inner.x1 - inner.x0, 0.16, 0.12], [0, ceilY - 0.08, inner.z0 + 0.06], beam);
  b.box([inner.x1 - inner.x0, 0.16, 0.12], [0, ceilY - 0.08, inner.z1 - 0.06], beam);
  b.box([0.12, 0.16, inner.z1 - inner.z0], [inner.x0 + 0.06, ceilY - 0.08, 0], beam);
  b.box([0.12, 0.16, inner.z1 - inner.z0], [inner.x1 - 0.06, ceilY - 0.08, 0], beam);
  // Стойки у стен.
  const post: PartOptions = { mat: 'woodgrain', color: 0xa26f43 };
  const postsZ = [inner.z0 + 0.1, -2.75, 0, 2.75, inner.z1 - 0.1];
  for (const z of postsZ) {
    if (!(z > SHOP.westWindows[0]!.z0 - 0.15 && z < SHOP.westWindows[0]!.z1 + 0.15) && !(z > SHOP.westWindows[1]!.z0 - 0.15 && z < SHOP.westWindows[1]!.z1 + 0.15))
      b.box([0.18, SHOP.ceilingH, 0.18], [inner.x0 + 0.09, F + SHOP.ceilingH / 2, z], post);
    if (!(z > wd.z0 - 0.15 && z < wd.z1 + 0.15)) b.box([0.18, SHOP.ceilingH, 0.18], [inner.x1 - 0.09, F + SHOP.ceilingH / 2, z], post);
  }
  for (const x of [-6.7, -1.25, 1.25, 6.7]) {
    b.box([0.18, SHOP.ceilingH, 0.14], [x, F + SHOP.ceilingH / 2, inner.z0 + 0.07], post);
  }
  for (const x of [-1.5, 3.3]) b.box([0.18, SHOP.ceilingH, 0.14], [x, F + SHOP.ceilingH / 2, inner.z1 - 0.07], post);
  // Поручень-планка над панелью.
  const rail: PartOptions = { mat: 'woodgrain', color: 0x8d6440 };
  b.box([inner.x1 - inner.x0, 0.06, 0.05], [0, F + SHOP.wainscotH, inner.z1 - 0.03], rail);
  b.box([0.05, 0.06, inner.z1 - inner.z0], [inner.x0 + 0.03, F + SHOP.wainscotH, 0], rail);
  b.box([0.05, 0.06, inner.z1 - inner.z0], [inner.x1 - 0.03, F + SHOP.wainscotH, 0], rail);
  for (const [a, c] of [
    [inner.x0, SHOP.frontWindows[0]!.x0],
    [SHOP.frontWindows[0]!.x1, fd.x0 - 0.15],
    [fd.x1 + 0.15, SHOP.frontWindows[1]!.x0],
    [SHOP.frontWindows[1]!.x1, inner.x1],
  ] as const) {
    if (c - a > 0.05) b.box([c - a, 0.06, 0.05], [(a + c) / 2, F + SHOP.wainscotH, inner.z0 + 0.03], rail);
  }
  // Плинтус.
  const skirt: PartOptions = { mat: 'woodgrain', color: 0x6f4d33, noShadow: true };
  b.box([inner.x1 - inner.x0, 0.1, 0.03], [0, F + 0.05, inner.z1 - 0.015], skirt);
  b.box([0.03, 0.1, inner.z1 - inner.z0], [inner.x0 + 0.015, F + 0.05, 0], skirt);

  // Подвесные лампы (зелёные плафоны, как в SHOP-01).
  const lamps: [number, number][] = [
    [-3.6, -2.75],
    [3.0, -2.75],
    [-3.6, 2.75],
    [3.0, 2.75],
  ];
  lamps.forEach(([x, z], i) => {
    const y = ceilY - 0.9;
    b.cyl(0.008, 0.008, 0.66, 4, [x, ceilY - 0.45, z], { color: P.iron, noShadow: true });
    b.lathe(
      [
        [0.05, 0.2],
        [0.09, 0.16],
        [0.2, 0.02],
        [0.24, -0.02],
        [0.235, -0.04],
      ],
      14,
      [x, y, z],
      { mat: 'metal', color: 0x2f5a48, noShadow: true },
    );
    b.sphere(0.07, 10, 8, [x, y - 0.03, z], { mat: 'emissive', color: P.lampWarm, noShadow: true });
    b.marker(`light_hall_${i}`, [x, y - 0.12, z]);
  });

  // ── Склад ──
  // Стены склада под односкатной крышей навеса: прямоугольник до низа ската + трапеция до ската.
  const lt0 = SHOP.leanTo;
  const roofHi0 = F + H - 0.15;
  const roofLo0 = F + 2.55;
  const run0 = lt0.x1 + 0.35 - lt0.x0;
  const roofAt = (x: number) => roofHi0 - ((x - lt0.x0) / run0) * (roofHi0 - roofLo0) - 0.05;
  const whH = roofAt(wh.x1 + T / 2) - F - 0.02;
  const whStyle = { ext, interior: { lower: { mat: 'wood', color: 0xb28a62, uvScale: 1 } as PartOptions, upper: { mat: 'wood', color: 0xb28a62, uvScale: 1 } as PartOptions, split: 1 } };
  const wo = SHOP.warehouseOuterDoor;
  wallAlongX(b, wh.z0, hall.x1 + T / 2, wh.x1 + T / 2, F, whH, T, -1, [{ a: wo.x0, b: wo.x1, y0: 0, y1: wo.h }], whStyle);
  wallAlongX(b, wh.z1, hall.x1 + T / 2, wh.x1 + T / 2, F, whH, T, 1, [], whStyle);
  wallAlongZ(b, wh.x1, wh.z0 + T / 2, wh.z1 - T / 2, F, whH, T, 1, [{ a: 1.6, b: 3.0, y0: 1.0, y1: 2.0 }], whStyle);
  windowZ(b, 2.3, wh.x1, T, 1, 1.4, F + 1.0, F + 2.0, { frame: trim, inner: woodIn, bars: [1, 1] });
  for (const z of [wh.z0, wh.z1]) {
    b.extrude(
      [
        [hall.x1 + T / 2, F + whH - 0.001],
        [wh.x1 + T / 2, F + whH - 0.001],
        [wh.x1 + T / 2, roofAt(wh.x1 + T / 2)],
        [hall.x1 + T / 2, roofAt(hall.x1 + T / 2)],
      ],
      T,
      [0, 0, z],
      ext,
    );
  }
  doorFrameX(b, (wo.x0 + wo.x1) / 2, wh.z0, T, -1, wo.x1 - wo.x0, F, wo.h, trim, woodIn);
  const half = (wo.x1 - wo.x0) / 2 - 0.01;
  b.node('door_whout_L', [wo.x0 + 0.01, F, wh.z0], [0, 0, 0], (nb) => doorLeaf(nb, half, wo.h - 0.02, trim, 0, 1), { door: 'warehouse_out', hinge: -1 });
  b.node('door_whout_R', [wo.x1 - 0.01, F, wh.z0], [0, Math.PI, 0], (nb) => doorLeaf(nb, half, wo.h - 0.02, trim, 0, 1), { door: 'warehouse_out', hinge: 1 });
  // Лампа склада.
  b.box([0.5, 0.06, 0.16], [10, F + whH - 0.05, 2.5], { mat: 'emissive', color: P.lampWarm, noShadow: true });
  b.marker('light_wh', [10, F + whH - 0.3, 2.5]);

  // ── Крыша зала (ряды черепицы, как в BLD-01/SHOP-00) ──
  const roofInfo = styledGableRoof(b, {
    span: hall.x1 - hall.x0,
    length: hall.z1 - hall.z0,
    eaveY: F + H,
    pitchDeg: SHOP.roofPitchDeg,
    overhangSide: 0.55,
    overhangEnd: SHOP.roofOverhang,
    color: P.roofGreen,
    trim,
    ridgeAlong: 'z',
    gable: { mat: 'wood', color: 0xc99260, uvScale: 1.1 },
    gableT: T,
  });
  const ridgeY = roofInfo.ridgeY;
  b.marker('ridge', [0, ridgeY, 0]);
  styledChimney(b, 3.4, 2.4, roofInfo.topAt(3.4) - 1.0, ridgeY + 0.75, P.brick, 'brick', 0.62);
  // Слуховое окошко-вентиляция на заднем фронтоне.
  b.box([0.7, 0.5, 0.05], [0, F + H + 1.3, hall.z1 + T / 2 + 0.03], { mat: 'woodgrain', color: trim });

  // ── Навес доставки и крыша склада (односкатная) ──
  const lt = SHOP.leanTo;
  const roofHi = F + H - 0.15;
  const roofLo = F + 2.55;
  const run = lt.x1 + 0.35 - lt.x0;
  const slope = Math.atan2(roofHi - roofLo, run);
  const roofLen = wh.z1 + 0.35 - (lt.z0 - 0.3);
  const rcz = (wh.z1 + 0.35 + lt.z0 - 0.3) / 2;
  styledShedRoof(b, lt.x0, lt.x1 + 0.35, roofHi + 0.05, roofLo, lt.z0 - 0.3, wh.z1 + 0.35, P.roofGreen, trim);
  void slope;
  void roofLen;
  void rcz;
  // Балка и столбы навеса.
  const ltPost: PartOptions = { mat: 'woodgrain', color: 0xa87a4c };
  const ltPosts: [number, number][] = [
    [lt.x0 + 0.12, lt.z0 + 0.12],
    [lt.x1 - 0.12, lt.z0 + 0.12],
    [lt.x1 - 0.12, (lt.z0 + lt.z1) / 2 - 0.2],
  ];
  for (const [x, z] of ltPosts) {
    const top = roofHi - ((x - lt.x0) / run) * (roofHi - roofLo);
    b.box([0.16, top - F, 0.16], [x, F + (top - F) / 2, z], ltPost);
  }
  b.plankBetween([lt.x0 + 0.12, roofHi - 0.12, lt.z0 + 0.12], [lt.x1 - 0.12, roofLo + 0.02, lt.z0 + 0.12], 0.14, 0.18, ltPost);
  b.box([0.14, 0.18, lt.z1 - lt.z0], [lt.x1 - 0.12, roofLo - 0.04, (lt.z0 + lt.z1) / 2], ltPost);
  // Настил навеса.
  b.box([lt.x1 - lt.x0, 0.06, lt.z1 - lt.z0], [(lt.x0 + lt.x1) / 2, F - 0.03, (lt.z0 + lt.z1) / 2], { mat: 'wood', color: 0xb08a62, uvScale: 0.8, uvSwap: true });
  b.box([lt.x1 - lt.x0, F - 0.06, 0.06], [(lt.x0 + lt.x1) / 2, (F - 0.06) / 2, lt.z0 + 0.03], { mat: 'wood', color: P.woodDark, uvScale: 0.6 });
  b.box([0.06, F - 0.06, lt.z1 - lt.z0], [lt.x1 - 0.03, (F - 0.06) / 2, (lt.z0 + lt.z1) / 2], { mat: 'wood', color: P.woodDark, uvScale: 0.6 });
  // Ступенька с торца навеса.
  b.box([1.8, 0.15, 0.4], [10, 0.075, lt.z0 - 0.2], { mat: 'woodgrain', color: 0x9b7550 });
  b.box([0.4, 0.15, 1.6], [lt.x1 + 0.2, 0.075, -3.5], { mat: 'woodgrain', color: 0x9b7550 });
  // Фонарь под навесом.
  b.box([0.3, 0.08, 0.3], [10, roofHi - 0.75, -3.5], { mat: 'metal', color: P.iron, noShadow: true });
  b.sphere(0.09, 8, 6, [10, roofHi - 0.83, -3.5], { mat: 'emissive', color: P.lampWarm, noShadow: true });
  b.marker('light_delivery', [10, roofHi - 1.0, -3.5]);

  // ── Крыльцо ──
  const po = SHOP.porch;
  b.box([po.x1 - po.x0, 0.06, po.z1 - po.z0], [(po.x0 + po.x1) / 2, F - 0.03, (po.z0 + po.z1) / 2], { mat: 'wood', color: 0xb98d60, uvScale: 0.7, uvSwap: true });
  b.box([po.x1 - po.x0, F - 0.06, 0.06], [(po.x0 + po.x1) / 2, (F - 0.06) / 2, po.z0 + 0.03], { mat: 'wood', color: P.woodDark, uvScale: 0.6 });
  b.box([0.06, F - 0.06, po.z1 - po.z0], [po.x0 + 0.03, (F - 0.06) / 2, (po.z0 + po.z1) / 2], { mat: 'wood', color: P.woodDark, uvScale: 0.6 });
  const st = SHOP.steps;
  b.box([st.x1 - st.x0, 0.1, 0.42], [0, 0.05, st.z0 + 0.21], { mat: 'woodgrain', color: 0xa07a52 });
  b.box([st.x1 - st.x0, 0.2, 0.4], [0, 0.1, st.z1 - 0.2], { mat: 'woodgrain', color: 0xae8659 });
  // Столбы, балка, кронштейны.
  const pPost: PartOptions = { mat: 'woodgrain', color: trim };
  const porchTop = F + SHOP.porchRoofH - 0.35;
  const postXs = [po.x0 + 0.14, -1.75, 1.75, po.x1 - 0.14];
  for (const x of postXs) {
    b.box([0.17, porchTop - F, 0.17], [x, F + (porchTop - F) / 2, po.z0 + 0.15], pPost);
    b.box([0.24, 0.08, 0.24], [x, F + 0.04, po.z0 + 0.15], pPost);
  }
  b.box([po.x1 - po.x0, 0.2, 0.16], [(po.x0 + po.x1) / 2, porchTop + 0.1, po.z0 + 0.15], pPost);
  for (const x of postXs) {
    for (const s of [-1, 1]) {
      if ((x <= po.x0 + 0.2 && s < 0) || (x >= po.x1 - 0.2 && s > 0)) continue;
      b.plankBetween([x + s * 0.06, porchTop - 0.45, po.z0 + 0.15], [x + s * 0.5, porchTop + 0.02, po.z0 + 0.15], 0.07, 0.07, pPost);
    }
  }
  // Крыша крыльца.
  const prHi = F + SHOP.porchRoofH + 0.15;
  const prLo = porchTop + 0.22;
  const pDepth = po.z1 - po.z0 + 0.35;
  void pDepth;
  styledShedRoofZ(b, po.z1, po.z0 - 0.35, prHi, prLo, po.x0 - 0.2, po.x1 + 0.2, P.roofGreen, trim);
  // Фонарь над входом.
  b.cyl(0.01, 0.01, 0.3, 4, [0, prHi - 0.3, -6.9], { color: P.iron, noShadow: true });
  b.box([0.22, 0.04, 0.22], [0, prHi - 0.47, -6.9], { mat: 'metal', color: P.iron, noShadow: true });
  b.box([0.16, 0.26, 0.16], [0, prHi - 0.62, -6.9], { mat: 'emissive', color: P.lampWarm, noShadow: true });
  b.cone(0.16, 0.12, 4, [0, prHi - 0.43, -6.9], { mat: 'metal', color: P.iron, noShadow: true }, [0, Math.PI / 4, 0]);
  b.box([0.2, 0.04, 0.2], [0, prHi - 0.76, -6.9], { mat: 'metal', color: P.iron, noShadow: true });
  b.marker('light_porch', [0, prHi - 0.75, -7.0]);

  // ── Вывески (узлы, переключаются по состоянию реставрации) ──
  const gableZ = hall.z0 - T / 2 - 0.04;
  b.node('sign_gable', [0, F + H + 1.05, gableZ], [0, Math.PI, 0], (nb) => {
    nb.box([4.3, 2.15, 0.06], [0, 1.075, -0.02], { mat: 'woodgrain', color: trim });
    nb.plane(4.0, 2.0, [0, 1.075, 0.015], { mat: 'sign:shop_gable' });
  });
  b.node('sign_old', [0, F + SHOP.porchRoofH + 0.7, gableZ], [0, Math.PI, 0], (nb) => {
    nb.box([3.3, 0.86, 0.06], [0, 0, -0.02], { mat: 'woodgrain', color: 0x7d6a55 });
    nb.plane(3.2, 0.8, [0, 0, 0.015], { mat: 'sign:shop_old' });
    // Три лампы-«гусиные шеи» (SHOP-01).
    for (const x of [-1.1, 0, 1.1]) {
      nb.beam([x, 0.5, -0.02], [x, 0.85, 0.25], 0.015, 5, { mat: 'metal', color: P.iron, noShadow: true });
      nb.cone(0.13, 0.12, 8, [x, 0.8, 0.3], { mat: 'metal', color: P.iron, noShadow: true }, [0.3, 0, 0]);
    }
  });
  b.node('sign_new', [0, F + SHOP.porchRoofH + 0.62, gableZ], [0, Math.PI, 0], (nb) => {
    nb.box([3.6, 0.8, 0.06], [0, 0, -0.02], { mat: 'woodgrain', color: trim });
    nb.plane(3.45, 0.68, [0, 0, 0.015], { mat: 'sign:shop_new' });
  });
  // Табличка «Открыто/Закрыто» на двери (узел, переворачивается).
  b.node('sign_door', [fd.x0 + dw / 2 + 0.01, F + 1.55, hall.z0 - 0.08], [0, Math.PI, 0], (nb) => {
    nb.box([0.42, 0.22, 0.015], [0, 0, 0], { mat: 'woodgrain', color: P.woodDark });
    nb.plane(0.4, 0.2, [0, 0, 0.009], { mat: 'sign:closed' });
    nb.plane(0.4, 0.2, [0, 0, -0.009], { mat: 'sign:open' }, [0, Math.PI, 0]);
    nb.beam([-0.15, 0.1, 0], [0, 0.26, 0], 0.004, 3, { color: P.iron, noShadow: true });
    nb.beam([0.15, 0.1, 0], [0, 0.26, 0], 0.004, 3, { color: P.iron, noShadow: true });
  });

  // ── Задние ступени ──
  const bs = SHOP.backSteps;
  b.box([bs.x1 - bs.x0, 0.15, 0.45], [(bs.x0 + bs.x1) / 2, 0.075, bs.z1 - 0.225], { mat: 'woodgrain', color: 0x9b7550 });
  b.box([bs.x1 - bs.x0, F, 0.45], [(bs.x0 + bs.x1) / 2, F / 2, bs.z0 + 0.225], { mat: 'woodgrain', color: 0xa88159 });

  // Метки для геймплея.
  b.marker('counter', [4.75, F, -2.7]);
  return b;
}

defineAsset({
  id: 'shop_shell',
  name: 'Магазин бабушки (здание)',
  category: 'shop',
  func: 'Зал, склад, навес доставки, крыльцо; двери и вывески — узлы',
  ref: 'Shop/SHOP-00_restored_exterior.webp, Shop/SHOP-01_abandoned.webp',
  pivot: 'центр зала на земле, фасад в −Z',
  collider: 'стены по shopLayout.ts',
  anims: 'двери (узлы door_*), табличка двери',
  build: () => buildShopShell().build('shop_shell'),
});

// ───────── Реставрация ─────────

defineAsset({
  id: 'board_plank',
  name: 'Доска на окне',
  category: 'restoration',
  func: 'Заколоченные окна (R-BOARD-01…06): удерживать ЛКМ 2 с, взять, выбросить',
  ref: 'Shop/SHOP-01_abandoned.webp',
  pivot: 'центр доски',
  collider: 'хитбокс по габаритам',
  build: () => {
    const b = new ModelBuilder(201);
    b.box([4.0, 0.27, 0.045], [0, 0, 0], { mat: 'wood', color: P.woodGrey, uvScale: 0.7, uvSwap: true, jitter: 0.08 });
    b.box([0.02, 0.23, 0.01], [-1.6, 0, 0.026], { color: 0x6a6a64, noShadow: true });
    for (const x of [-1.85, -1.55, 1.55, 1.85]) b.cyl(0.012, 0.012, 0.012, 6, [x, 0.06, 0.026], { mat: 'metal', color: P.ironLight, noShadow: true }, [Math.PI / 2, 0, 0]);
    return b.build('board_plank');
  },
});

defineAsset({
  id: 'cobweb',
  name: 'Паутина',
  category: 'restoration',
  func: 'R-WEB-01…04: убрать метлой',
  ref: 'Shop/SHOP-01_abandoned.webp',
  pivot: 'угол паутины',
  collider: 'хитбокс',
  build: () => {
    const b = new ModelBuilder(202);
    b.plane(0.9, 0.9, [0.45, -0.45, 0], { mat: 'decal:cobweb', noShadow: true, noReceive: true });
    return b.build('cobweb');
  },
});

defineAsset({
  id: 'trash_bag',
  name: 'Мешок мусора',
  category: 'restoration',
  func: 'R-WASTE: взять (E) и отнести в контейнер',
  ref: 'Shop/SHOP-01_abandoned.webp',
  build: () => {
    const b = new ModelBuilder(203);
    b.ico(0.3, 1, [0, 0.27, 0], { mat: 'plastic', color: 0x2a2c2e, faceJitter: 0.12 }, [1, 0.95, 0.9], undefined, 0.18);
    b.ico(0.12, 1, [0, 0.58, 0], { mat: 'plastic', color: 0x2a2c2e, faceJitter: 0.1 }, [0.8, 1.2, 0.8], undefined, 0.2);
    b.ico(0.06, 0, [0.04, 0.7, 0], { mat: 'plastic', color: 0x2a2c2e }, [1.4, 0.6, 0.6]);
    return b.build('trash_bag');
  },
});

defineAsset({
  id: 'trash_sack',
  name: 'Бумажный мешок с мусором',
  category: 'restoration',
  func: 'R-WASTE: взять (E) и отнести в контейнер',
  ref: 'Shop/SHOP-01_abandoned.webp',
  build: () => {
    const b = new ModelBuilder(204);
    b.chamferBox([0.42, 0.5, 0.3], [0, 0.25, 0], 0.05, { mat: 'paper', color: 0xb08a5c, faceJitter: 0.06 });
    b.ico(0.16, 0, [0, 0.55, 0], { mat: 'paper', color: 0xa07a50, faceJitter: 0.08 }, [1.3, 0.5, 0.9], undefined, 0.25);
    b.ico(0.06, 0, [0.08, 0.62, 0.05], { mat: 'paper', color: 0xf0ece0 }, [1, 0.8, 1], undefined, 0.3);
    return b.build('trash_sack');
  },
});

defineAsset({
  id: 'paper_litter',
  name: 'Бумажка',
  category: 'restoration',
  func: 'Мусор от покупателей (вес 2), убирается метлой',
  ref: 'бриф',
  build: () => {
    const b = new ModelBuilder(205);
    b.ico(0.045, 0, [0, 0.03, 0], { mat: 'paper', color: P.paperWhite, faceJitter: 0.15 }, [1.3, 0.6, 1], undefined, 0.35);
    b.ico(0.03, 0, [0.08, 0.02, 0.03], { mat: 'paper', color: 0xe8d8b0, faceJitter: 0.15 }, [1.2, 0.6, 1], undefined, 0.35);
    return b.build('paper_litter');
  },
});

// ───────── Двор, доставка, контейнер ─────────

defineAsset({
  id: 'dumpster',
  name: 'Контейнер для мусора',
  category: 'shop',
  func: 'Сюда выбрасываются доски, мусор, пустые коробки',
  ref: 'Map/MAP-01_overview_labeled.webp (зелёный контейнер у магазина)',
  collider: 'бокс 1.9×1.1',
  build: () => {
    const b = new ModelBuilder(206);
    const g = 0x3c6b4f;
    b.box([1.8, 1.0, 1.0], [0, 0.6, 0], { mat: 'metal', color: g });
    b.box([1.86, 0.08, 1.06], [0, 0.18, 0], { mat: 'metal', color: 0x2d5240 });
    b.box([1.86, 0.08, 1.06], [0, 1.08, 0], { mat: 'metal', color: 0x2d5240 });
    for (const x of [-0.6, 0, 0.6]) b.box([0.05, 0.9, 1.04], [x, 0.62, 0], { mat: 'metal', color: 0x34604a });
    // Крышки.
    b.box([0.9, 0.05, 1.08], [-0.45, 1.16, 0.02], { mat: 'plastic', color: 0x2b2f2c }, [0.06, 0, 0]);
    b.box([0.9, 0.05, 1.08], [0.45, 1.16, 0.02], { mat: 'plastic', color: 0x2b2f2c }, [0.06, 0, 0]);
    // Колёса.
    for (const [x, z] of [
      [-0.75, -0.4],
      [0.75, -0.4],
      [-0.75, 0.4],
      [0.75, 0.4],
    ] as const)
      b.cyl(0.08, 0.08, 0.05, 8, [x, 0.08, z], { color: P.black }, [0, 0, Math.PI / 2]);
    b.plane(0.5, 0.25, [0, 0.7, 0.505], { mat: 'sign:village', noShadow: true });
    return b.build('dumpster');
  },
});

defineAsset({
  id: 'delivery_pallet',
  name: 'Поддон зоны доставки',
  category: 'shop',
  func: '4 места для коробок (всего 12)',
  ref: 'Shop/SHOP-00_restored_exterior.webp',
  build: () => {
    const b = new ModelBuilder(207);
    const w = 0x8c6a46;
    for (const x of [-0.55, 0, 0.55]) b.box([0.12, 0.1, 1.0], [x, 0.05, 0], { mat: 'woodgrain', color: w, jitter: 0.1 });
    for (const z of [-0.42, -0.14, 0.14, 0.42]) b.box([1.2, 0.025, 0.16], [0, 0.112, z], { mat: 'woodgrain', color: 0xa8845a, jitter: 0.1 });
    return b.build('delivery_pallet');
  },
});

defineAsset({
  id: 'hand_truck',
  name: 'Тележка',
  category: 'shop',
  func: 'Декор зоны доставки',
  ref: 'Shop/SHOP-00_restored_exterior.webp',
  build: () => {
    const b = new ModelBuilder(208);
    const m: PartOptions = { mat: 'metal', color: 0x2f3437 };
    b.beam([-0.2, 0.15, 0], [-0.2, 1.25, -0.25], 0.02, 6, m);
    b.beam([0.2, 0.15, 0], [0.2, 1.25, -0.25], 0.02, 6, m);
    b.beam([-0.2, 1.25, -0.25], [0.2, 1.25, -0.25], 0.02, 6, m);
    b.beam([-0.2, 0.6, -0.1], [0.2, 0.6, -0.1], 0.015, 6, m);
    b.box([0.45, 0.02, 0.22], [0, 0.04, 0.1], m);
    for (const s of [-1, 1]) b.cyl(0.13, 0.13, 0.06, 12, [s * 0.27, 0.13, 0], { color: P.black }, [0, 0, Math.PI / 2]);
    return b.build('hand_truck');
  },
});

/** Позиции поддонов для экспорта в мир (используется Shop). */
export const PALLET_POSITIONS = DELIVERY_PALLETS;
