import { ModelBuilder, type PartOptions } from '../ModelKit';
import { P } from '../palette';
import { defineAsset } from '../registry';
import { wallAlongX, wallAlongZ, shade, type Opening } from './buildingKit';
import {
  styledGableRoof,
  styledShedRoof,
  stonePlinth,
  timberFrameX,
  timberFrameZ,
  chunkyWindowX,
  chunkyWindowZ,
  chunkyDoorX,
  styledChimney,
  type FrameSpec,
} from './styleKit';

/**
 * Стилизованные дома (референсы BLD-01, MAP-01, MAP-03): 1,5–2 этажа, крутые крыши рядами
 * черепицы, фахверк, обшитые досками фронтоны, массивные окна со ставнями и цветами.
 * Фасад с дверью смотрит в +Z, пивот — центр основания.
 */

export interface StyledHouseSpec {
  seed: number;
  w: number;
  d: number;
  base: number;
  wallH: number;
  floors: 1 | 2;
  wall: PartOptions;
  frame?: FrameSpec | null;
  roof: { color: number; pitch: number; ridge: 'x' | 'z'; overhang?: number };
  gable: PartOptions;
  trim: number;
  shutters?: number | null;
  flowers?: boolean;
  door: { x: number; color: number; canopy?: boolean; lantern?: boolean; glass?: boolean; w?: number };
  winW?: number;
  chimneys?: [number, number][];
  chimneyMat?: 'stone' | 'brick' | 'plaster';
  chimneyColor?: number;
  dormers?: number[];
  crossGable?: { x: number; w: number; proj: number; wall?: PartOptions; gable?: PartOptions } | null;
  frontWindows?: number[];
  sideWindows?: number;
  backWindows?: number;
  annex?: { side: 1 | -1; w: number; d: number; h: number; wall: PartOptions; roofColor: number; open?: boolean } | null;
}

const WT = 0.24;

function evenSlots(len: number, n: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(-len / 2 + (len * (i + 0.5)) / n);
  return out;
}

export function styledHouse(s: StyledHouseSpec): ModelBuilder {
  const b = new ModelBuilder(s.seed);
  const { w, d, base: B, wallH } = s;
  const winW = s.winW ?? 0.95;
  const doorW = s.door.w ?? 1.05;
  const doorH = 2.1;
  const rowsY: [number, number][] = s.floors === 2 ? [[0.95, 2.1], [wallH / 2 + 0.85, wallH / 2 + 1.95]] : [[0.95, 2.15]];
  const style = { ext: s.wall, interior: null };

  stonePlinth(b, w, d, B);
  b.collider(0, 0, w / 2 + 0.15, d / 2 + 0.15);

  // ── Проёмы ──
  const frontX = s.frontWindows ?? evenSlots(w, Math.max(2, Math.round(w / 2.4))).filter((x) => Math.abs(x - s.door.x) > doorW / 2 + winW / 2 + 0.25);
  const cg = s.crossGable ?? null;
  const front: Opening[] = [{ a: s.door.x - doorW / 2, b: s.door.x + doorW / 2, y0: 0, y1: doorH }];
  const frontWinList: { x: number; y0: number; y1: number }[] = [];
  rowsY.forEach(([y0, y1], fi) => {
    const xs = fi === 0 ? frontX : evenSlots(w, Math.max(2, Math.round(w / 2.4)));
    for (const x of xs) {
      if (cg && Math.abs(x - cg.x) < cg.w / 2 + winW / 2) continue;
      front.push({ a: x - winW / 2, b: x + winW / 2, y0, y1 });
      frontWinList.push({ x, y0, y1 });
    }
  });
  const sideZ = evenSlots(d, s.sideWindows ?? Math.max(1, Math.round(d / 3.2)));
  const backX = evenSlots(w, s.backWindows ?? Math.max(1, Math.round(w / 3)));
  const side: Opening[] = [];
  const back: Opening[] = [];
  for (const [y0, y1] of rowsY) {
    for (const z of sideZ) side.push({ a: z - winW / 2, b: z + winW / 2, y0, y1 });
    for (const x of backX) back.push({ a: x - winW / 2, b: x + winW / 2, y0, y1 });
  }

  wallAlongX(b, d / 2, -w / 2 - WT / 2, w / 2 + WT / 2, B, wallH, WT, 1, front, style);
  wallAlongX(b, -d / 2, -w / 2 - WT / 2, w / 2 + WT / 2, B, wallH, WT, -1, back, style);
  wallAlongZ(b, -w / 2, -d / 2 + WT / 2, d / 2 - WT / 2, B, wallH, WT, -1, side, style);
  wallAlongZ(b, w / 2, -d / 2 + WT / 2, d / 2 - WT / 2, B, wallH, WT, 1, side, style);
  b.box([w - 0.1, 0.1, d - 0.1], [0, B + 0.05, 0], { color: 0x5e4a3a, noShadow: true });

  // ── Фахверк или угловые стойки ──
  const toAbs = (o: Opening) => ({ a: o.a, b: o.b, y0: B + o.y0, y1: B + o.y1 });
  if (s.frame) {
    const rails = s.floors === 2 ? [B + wallH / 2] : [];
    const f = { ...s.frame, rails: [...(s.frame.rails ?? []), ...rails] };
    timberFrameX(b, d / 2, 1, -w / 2 - WT / 2 + 0.08, w / 2 + WT / 2 - 0.08, B, B + wallH, front.map(toAbs), f, WT);
    timberFrameX(b, -d / 2, -1, -w / 2 - WT / 2 + 0.08, w / 2 + WT / 2 - 0.08, B, B + wallH, back.map(toAbs), f, WT);
    timberFrameZ(b, -w / 2, -1, -d / 2 - WT / 2 + 0.08, d / 2 + WT / 2 - 0.08, B, B + wallH, side.map(toAbs), f, WT);
    timberFrameZ(b, w / 2, 1, -d / 2 - WT / 2 + 0.08, d / 2 + WT / 2 - 0.08, B, B + wallH, side.map(toAbs), f, WT);
  } else {
    for (const [x, z] of [
      [-w / 2, -d / 2],
      [w / 2, -d / 2],
      [-w / 2, d / 2],
      [w / 2, d / 2],
    ] as const) b.chamferBox([WT + 0.1, wallH, WT + 0.1], [x, B + wallH / 2, z], 0.03, { mat: 'woodgrain', color: s.trim });
    if (s.floors === 2) {
      for (const z of [d / 2 + WT / 2 + 0.03, -d / 2 - WT / 2 - 0.03]) b.chamferBox([w + 0.3, 0.14, 0.07], [0, B + wallH / 2, z], 0.02, { mat: 'woodgrain', color: s.trim });
    }
  }

  // ── Окна и дверь ──
  const ws = { frame: s.trim, shutters: s.shutters ?? null, bars: [1, 1] as [number, number] };
  for (const fw of frontWinList) chunkyWindowX(b, fw.x, d / 2, WT, 1, winW, B + fw.y0, B + fw.y1, { ...ws, flowers: !!s.flowers && fw.y0 < 1.5 });
  for (const o of back) chunkyWindowX(b, (o.a + o.b) / 2, -d / 2, WT, -1, winW, B + o.y0, B + o.y1, ws);
  for (const o of side) {
    chunkyWindowZ(b, (o.a + o.b) / 2, -w / 2, WT, -1, winW, B + o.y0, B + o.y1, ws);
    chunkyWindowZ(b, (o.a + o.b) / 2, w / 2, WT, 1, winW, B + o.y0, B + o.y1, ws);
  }
  chunkyDoorX(b, s.door.x, d / 2, WT, 1, doorW, B, doorH, s.trim, s.door.color, { canopy: s.door.canopy ? s.roof.color : null, lantern: s.door.lantern, glass: s.door.glass });

  // ── Крыша ──
  const eave = B + wallH;
  const ridgeX = s.roof.ridge === 'x';
  const roof = styledGableRoof(b, {
    span: ridgeX ? d : w,
    length: ridgeX ? w : d,
    eaveY: eave,
    pitchDeg: s.roof.pitch,
    overhangSide: s.roof.overhang ?? 0.5,
    overhangEnd: 0.4,
    color: s.roof.color,
    trim: s.trim,
    ridgeAlong: s.roof.ridge,
    gable: s.gable,
    gableT: WT,
  });
  const rise = roof.ridgeY - eave;
  // Окна во фронтонах.
  if (rise > 1.5) {
    const gy0 = eave + 0.35;
    const gy1 = eave + Math.min(1.25, rise * 0.45);
    if (ridgeX) {
      for (const sx of [-1, 1] as const) chunkyWindowZ(b, 0, sx * (w / 2), WT, sx, 0.75, gy0, gy1, { frame: s.trim, bars: [1, 1] });
    } else {
      chunkyWindowX(b, 0, d / 2, WT, 1, 0.8, gy0, gy1, { frame: s.trim, bars: [1, 1], shutters: s.shutters ?? null });
      chunkyWindowX(b, 0, -d / 2, WT, -1, 0.7, gy0, gy1 - 0.1, { frame: s.trim, bars: [1, 1] });
    }
  }

  // ── Мансардные окна на переднем скате ──
  if (ridgeX && s.dormers?.length) {
    const tan = Math.tan((s.roof.pitch * Math.PI) / 180);
    for (const x of s.dormers) {
      const zf = d / 2 - 0.7;
      const yb = roof.ridgeY - zf * tan;
      const dw = 1.45;
      const dh = 1.35;
      const dd = 2.2;
      b.box([dw, dh + 0.5, dd], [x, yb + dh / 2 - 0.25, zf - dd / 2], s.gable);
      chunkyWindowX(b, x, zf + 0.02, 0.06, 1, 0.75, yb + 0.15, yb + 0.95, { frame: s.trim, bars: [1, 1] });
      styledGableRoof(b, { span: dw, length: dd + 0.1, eaveY: yb + dh - 0.1, pitchDeg: 42, overhangSide: 0.18, overhangEnd: 0.15, color: s.roof.color, trim: s.trim, ridgeAlong: 'z', gable: s.gable, gableT: 0.08, rowW: 0.38 }, x, zf - dd / 2 + 0.05);
    }
  }

  // ── Поперечный фронтон (выступ фасада) ──
  if (ridgeX && cg) {
    const z0 = d / 2 - 0.2;
    const z1 = d / 2 + cg.proj;
    const cwall = cg.wall ?? s.wall;
    b.collider(cg.x, (z0 + z1) / 2, cg.w / 2 + 0.15, (z1 - z0) / 2 + 0.15);
    stonePlinth(b, cg.w, cg.proj + 0.2, B, cg.x, (z0 + z1) / 2);
    const cst = { ext: cwall, interior: null };
    const cy0 = rowsY[0]![0];
    const cy1 = rowsY[0]![1];
    wallAlongX(b, z1, cg.x - cg.w / 2 - WT / 2, cg.x + cg.w / 2 + WT / 2, B, wallH, WT, 1, [{ a: cg.x - 0.6, b: cg.x + 0.6, y0: cy0, y1: cy1 }], cst);
    wallAlongZ(b, cg.x - cg.w / 2, z0, z1 - WT / 2, B, wallH, WT, -1, [], cst);
    wallAlongZ(b, cg.x + cg.w / 2, z0, z1 - WT / 2, B, wallH, WT, 1, [], cst);
    chunkyWindowX(b, cg.x, z1, WT, 1, 1.2, B + cy0, B + cy1, { ...ws, flowers: !!s.flowers, bars: [2, 1] });
    for (const sx of [-1, 1]) b.chamferBox([WT + 0.1, wallH, WT + 0.1], [cg.x + sx * (cg.w / 2), B + wallH / 2, z1], 0.03, { mat: 'woodgrain', color: s.trim });
    const len = z1 - (d / 2 - 2.6);
    const cr = styledGableRoof(b, { span: cg.w, length: len, eaveY: eave, pitchDeg: Math.min(55, s.roof.pitch + 6), overhangSide: 0.4, overhangEnd: 0.3, color: s.roof.color, trim: s.trim, ridgeAlong: 'z', gable: cg.gable ?? s.gable, gableT: WT }, cg.x, z1 - len / 2);
    if (cr.ridgeY - eave > 1.4) chunkyWindowX(b, cg.x, z1, WT, 1, 0.65, eave + 0.3, eave + Math.min(1.1, (cr.ridgeY - eave) * 0.45), { frame: s.trim, bars: [1, 1] });
  }

  // ── Трубы ──
  for (const [x, z] of s.chimneys ?? []) {
    const h = ridgeX ? Math.abs(z) : Math.abs(x);
    const yRoof = roof.topAt(h);
    styledChimney(b, x, z, yRoof - 1.2, Math.max(roof.ridgeY + 0.55, yRoof + 1.0), s.chimneyColor ?? P.stone, s.chimneyMat ?? 'stone');
  }

  // ── Пристройка ──
  if (s.annex) {
    const a = s.annex;
    const ax0 = a.side > 0 ? w / 2 : -w / 2 - a.w;
    const ax1 = ax0 + a.w;
    const az0 = -d / 2 + 0.25;
    const az1 = az0 + a.d;
    stonePlinth(b, a.w, a.d, B * 0.8, (ax0 + ax1) / 2, (az0 + az1) / 2);
    b.collider((ax0 + ax1) / 2, (az0 + az1) / 2, a.w / 2 + 0.1, a.d / 2 + 0.1);
    const ast = { ext: a.wall, interior: null };
    const outerX = a.side > 0 ? ax1 : ax0;
    if (!a.open) {
      wallAlongX(b, az1, ax0, ax1, B, a.h, WT, 1, [{ a: (ax0 + ax1) / 2 - 0.5, b: (ax0 + ax1) / 2 + 0.5, y0: 0, y1: 1.95 }], ast);
      wallAlongX(b, az0, ax0, ax1, B, a.h, WT, -1, [], ast);
      wallAlongZ(b, outerX, az0 + WT / 2, az1 - WT / 2, B, a.h, WT, a.side, [{ a: (az0 + az1) / 2 - 0.45, b: (az0 + az1) / 2 + 0.45, y0: 0.9, y1: 1.7 }], ast);
      chunkyWindowZ(b, (az0 + az1) / 2, outerX, WT, a.side, 0.9, B + 0.9, B + 1.7, ws);
      chunkyDoorX(b, (ax0 + ax1) / 2, az1, WT, 1, 1.0, B, 1.95, s.trim, shade(s.door.color, 0.9), { step: false });
    } else {
      for (const z of [az0 + 0.1, az1 - 0.1]) b.chamferBox([0.16, a.h, 0.16], [outerX - a.side * 0.1, B + a.h / 2, z], 0.02, { mat: 'woodgrain', color: s.trim });
      wallAlongX(b, az0, ax0, ax1, B, a.h, WT, -1, [], ast);
    }
    styledShedRoof(b, a.side > 0 ? ax0 : ax1, a.side > 0 ? ax1 + 0.35 : ax0 - 0.35, B + a.h + 0.85, B + a.h + 0.02, az0 - 0.3, az1 + 0.3, a.roofColor, s.trim);
    // Треугольники-заполнения между стенами и скатом.
    if (!a.open) {
      for (const z of [az0, az1]) {
        b.extrude(
          [
            [ax0, B + a.h - 0.01],
            [ax1, B + a.h - 0.01],
            [ax1, a.side > 0 ? B + a.h + 0.05 : B + a.h + 0.8],
            [ax0, a.side > 0 ? B + a.h + 0.8 : B + a.h + 0.05],
          ],
          WT,
          [0, 0, z],
          a.wall,
        );
      }
    }
  }
  b.marker('door', [s.door.x, B, d / 2 + 0.9]);
  return b;
}

// ───────── Семейства жилых домов ─────────

const WALLS: Record<string, PartOptions> = {
  cream: { mat: 'plaster', color: 0xf0e2c2, uvScale: 2 },
  white: { mat: 'plaster', color: 0xf3efe6, uvScale: 2 },
  pink: { mat: 'plaster', color: 0xeed2c0, uvScale: 2 },
};
const BOARDS: Record<string, PartOptions> = {
  slate: { mat: 'wood', color: 0xb98a5a, uvScale: 1.1 },
  terracotta: { mat: 'wood', color: 0xc49563, uvScale: 1.1 },
  green: { mat: 'wood', color: 0x5f8a6a, uvScale: 1.1 },
};
const ROOFS: Record<string, number> = { slate: 0x4c5466, terracotta: 0xbe5a3c, green: 0x3e6b57 };
const TRIMS: Record<string, number> = { slate: 0x6b4b34, terracotta: 0x6b4a36, green: P.green };
const SHUTTERS: Record<string, number> = { slate: 0x4d6e8a, terracotta: 0x5f7f4a, green: 0x3f6b4f };

export function familySpec(family: 'cottage' | 'twostorey' | 'timber', roof: string, wall: string, seed: number): StyledHouseSpec {
  const roofColor = ROOFS[roof] ?? ROOFS.slate!;
  const trim = TRIMS[roof] ?? 0x6b4b34;
  const wl = WALLS[wall] ?? WALLS.cream!;
  const boards = BOARDS[roof] ?? BOARDS.slate!;
  if (family === 'cottage') {
    return {
      seed,
      w: 7.6,
      d: 6.0,
      base: 0.45,
      wallH: 2.7,
      floors: 1,
      wall: wl,
      frame: null,
      roof: { color: roofColor, pitch: 46, ridge: 'x' },
      gable: boards,
      trim,
      shutters: SHUTTERS[roof] ?? 0x4d6e8a,
      flowers: true,
      door: { x: 0.4, color: 0x7a4e30, canopy: true, lantern: true },
      chimneys: [[-2.3, -0.9]],
      chimneyMat: 'stone',
      dormers: [-1.7],
      frontWindows: [-2.4, 2.5],
    };
  }
  if (family === 'twostorey') {
    return {
      seed,
      w: 8.0,
      d: 6.4,
      base: 0.45,
      wallH: 5.0,
      floors: 2,
      wall: wl,
      frame: null,
      roof: { color: roofColor, pitch: 40, ridge: 'x' },
      gable: boards,
      trim,
      shutters: null,
      flowers: true,
      door: { x: 0, color: 0x3d6652, canopy: true, lantern: true },
      chimneys: [[2.5, -1.2]],
      chimneyMat: 'brick',
      chimneyColor: P.brick,
      annex: { side: -1, w: 2.8, d: 3.8, h: 2.4, wall: { mat: 'wood', color: 0xa77a50, uvScale: 1.1 }, roofColor: shade(roofColor, 0.92) },
    };
  }
  return {
    seed,
    w: 7.4,
    d: 6.6,
    base: 0.5,
    wallH: 3.3,
    floors: 1,
    wall: wl,
    frame: { color: 0x6a4a32, braces: true, t: 0.17 },
    roof: { color: roofColor, pitch: 50, ridge: 'z' },
    gable: boards,
    trim: 0x5a4030,
    shutters: null,
    flowers: true,
    door: { x: 1.2, color: 0x5a3a28, canopy: false, lantern: true },
    chimneys: [[1.4, -1.6]],
    chimneyMat: 'brick',
    chimneyColor: P.brick,
    frontWindows: [-1.8],
    annex: { side: 1, w: 2.4, d: 3.2, h: 2.3, wall: { mat: 'wood', color: 0xa07a52, uvScale: 1.1 }, roofColor: shade(roofColor, 0.95), open: true },
  };
}

export function houseAssetId(family: string, roof: string, wall: string): string {
  return `house_${family}_${roof}_${wall}`;
}

export const HOUSE_VARIANTS: [('cottage' | 'twostorey' | 'timber'), string, string][] = [
  ['cottage', 'slate', 'cream'],
  ['cottage', 'slate', 'white'],
  ['cottage', 'terracotta', 'cream'],
  ['cottage', 'terracotta', 'pink'],
  ['twostorey', 'terracotta', 'cream'],
  ['twostorey', 'green', 'cream'],
  ['twostorey', 'slate', 'white'],
  ['timber', 'slate', 'cream'],
  ['timber', 'slate', 'white'],
];

HOUSE_VARIANTS.forEach(([fam, roof, wall], i) => {
  const id = houseAssetId(fam, roof, wall);
  defineAsset({
    id,
    name: `Жилой дом: ${fam === 'cottage' ? 'коттедж с мансардой' : fam === 'twostorey' ? 'двухэтажный' : 'фахверк'} (${roof}, ${wall})`,
    category: 'house',
    func: 'Жилые дома деревни, окна светятся ночью',
    ref: 'Map/MAP-01, Map/MAP-03, BLD-01 (стиль)',
    collider: 'бокс по габариту дома',
    build: () => styledHouse(familySpec(fam, roof, wall, 500 + i)).build(id),
  });
});
