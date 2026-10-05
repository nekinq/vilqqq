/** Палитра арт-дирекшна (Docs/ArtDirection.md). Все цвета моделей берутся отсюда. */
export const P = {
  // Дерево
  wood: 0xb78555,
  woodLight: 0xc9955f,
  woodDark: 0x7a5434,
  woodGrey: 0x9a8f80, // выветренная доска
  woodRed: 0x9c5b3c,
  plank: 0xb98a5c,
  // Стены
  plaster: 0xe8ddc7,
  plasterWarm: 0xefdcb8,
  plasterWhite: 0xf1ece2,
  plasterPink: 0xe9cfc0,
  wainscot: 0x8a9a80,
  // Отделка
  green: 0x315449,
  greenDark: 0x24403a,
  greenLight: 0x4a7a65,
  teal: 0x2f7f78,
  tealDark: 0x225e59,
  burgundy: 0x7d2e3a,
  burgundyDark: 0x5a1f29,
  sun: 0xd5ac64,
  text: 0x26322d,
  cream: 0xf4eedf,
  // Крыши
  roofGreen: 0x3e6b57,
  roofSlate: 0x4a5568,
  roofSlateDark: 0x3b4352,
  roofTerracotta: 0xb5553a,
  roofRed: 0xa4473a,
  roofBrown: 0x6e5040,
  // Камень и металл
  stone: 0xa59d90,
  stoneDark: 0x857d72,
  stoneLight: 0xc7bfb2,
  cobble: 0xb9ab98,
  brick: 0xb07a5e,
  brickDark: 0x8e5b45,
  iron: 0x2b2d2f,
  ironLight: 0x4a4e52,
  steel: 0xb4bcc2,
  chrome: 0xd8dde0,
  // Природа
  grass: 0x7fa34a,
  grassDark: 0x5e8a3a,
  grassDry: 0xc2a25a,
  leaf: 0x6b9a3c,
  leafDark: 0x4b7a2e,
  leafLight: 0x8fb84e,
  leafYellow: 0xa8b84a,
  pine: 0x3f6b3a,
  pineDark: 0x2f5530,
  trunk: 0x6b4a33,
  trunkDark: 0x553a28,
  dirt: 0xd9b482,
  soil: 0x6e4c34,
  // Ткань и прочее
  canvasWhite: 0xf2ece0,
  awningYellow: 0xe8a23b,
  awningRed: 0xb9473a,
  awningGreen: 0x4e8b3a,
  cardboard: 0xc49a6c,
  cardboardDark: 0xa57e55,
  paperWhite: 0xf5f1e8,
  glassTint: 0x9fc4cc,
  windowDark: 0x3d4f5a,
  black: 0x1e1f21,
  white: 0xf7f5f0,
  lampWarm: 0xffd59a,
} as const;

/** Цвета кожи для персонажей. */
export const SKIN_TONES = [0xf2c9a5, 0xe8b48f, 0xd9a07a, 0xc28660, 0xa86f4c, 0x8a5a3c] as const;
/** Цвета волос. */
export const HAIR_COLORS = [0x2b1d14, 0x4a3022, 0x6b4426, 0x8c5a2e, 0xb08850, 0xd8c08a, 0x9a9a98, 0xd8d6d0, 0x6e2c1c] as const;
