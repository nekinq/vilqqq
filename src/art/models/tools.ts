import { ModelBuilder } from '../ModelKit';
import { P } from '../palette';
import { defineAsset } from '../registry';

/** Инструменты игрока: метла (клавиша 2). */

export function buildBroom(b: ModelBuilder): void {
  // Черенок.
  b.cyl(0.016, 0.018, 1.25, 7, [0, 0.62 + 0.25, 0], { mat: 'woodgrain', color: P.woodLight, smooth: true });
  b.sphere(0.022, 6, 4, [0, 1.5, 0], { mat: 'woodgrain', color: P.woodDark });
  // Обвязка.
  b.cyl(0.04, 0.045, 0.06, 8, [0, 0.27, 0], { mat: 'metal', color: P.ironLight });
  b.cyl(0.052, 0.058, 0.03, 8, [0, 0.2, 0], { color: 0xb8402e });
  // Веник: соломенный пучок, расширяется книзу.
  b.hull(
    [
      [-0.05, 0.27, -0.035],
      [0.05, 0.27, -0.035],
      [-0.05, 0.27, 0.035],
      [0.05, 0.27, 0.035],
      [-0.16, 0.0, -0.05],
      [0.16, 0.0, -0.05],
      [-0.16, 0.0, 0.05],
      [0.16, 0.0, 0.05],
      [0, 0.0, 0.07],
      [0, 0.0, -0.07],
    ],
    [0, 0, 0],
    { color: 0xd8b060, faceJitter: 0.08 },
  );
  for (let i = 0; i < 7; i++) {
    const x = -0.14 + i * 0.047;
    b.box([0.012, 0.22, 0.012], [x, 0.11, 0.058], { color: 0xc49a4a, noShadow: true }, [0, 0, x * 0.6]);
  }
}

defineAsset({
  id: 'broom',
  name: 'Метла',
  category: 'tool',
  func: 'Уборка: паутина, пятна, следы, бумажки (удерживать ЛКМ)',
  ref: 'Shop/SHOP-01 (метла у прилавка)',
  pivot: 'низ веника',
  build: () => {
    const b = new ModelBuilder(1701);
    buildBroom(b);
    return b.build('broom');
  },
});
