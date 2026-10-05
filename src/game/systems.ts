import * as THREE from 'three';
import type { Game } from './Game';
import { PRODUCT_IDS } from '../data/products';
import { CUSTOMER_ASSET_IDS, NAMED_CHARACTER_IDS } from '../art/models/characters';
import { ProductRenderer } from '../inventory/ProductRenderer';
import { StockSystem } from '../inventory/StockSystem';
import { NavGrid, RoadGraph } from '../world/Navigation';
import { Viewmodel } from '../player/Viewmodel';
import { PlayerSystem } from '../player/PlayerSystem';
import { AudioSystem } from '../audio/Audio';
import { SaveManager } from '../save/SaveManager';
import { UI } from '../ui/UI';
import { CounterSystem } from '../checkout/CounterSystem';
import { RestorationSystem } from '../cleaning/RestorationSystem';
import { DirtSystem } from '../cleaning/DirtSystem';
import { CustomerSystem } from '../customers/CustomerSystem';
import { SupplierSystem } from '../suppliers/SupplierSystem';
import { Flow } from './Flow';
import { SHOP_ORIGIN, FLOOR_Y } from '../world/shopLayout';

/** Ассеты, нужные игровым системам (мир грузит свои в Village). */
export const RUNTIME_ASSETS = [
  ...PRODUCT_IDS.map((id) => `prod_${id}`),
  'box_cardboard',
  'shelf_gondola',
  'storage_rack',
  'fridge',
  'freezer',
  'checkout_counter',
  'scanner',
  'basket',
  'banknote',
  'board_plank',
  'cobweb',
  'trash_bag',
  'trash_sack',
  'paper_litter',
  'broom',
  ...CUSTOMER_ASSET_IDS,
  ...NAMED_CHARACTER_IDS,
];

/** Собрать игровые системы поверх мира. Порядок обновления важен. */
export async function attachSystems(game: Game, onProgress?: (p: number, label: string) => void): Promise<void> {
  await game.assets.preload(RUNTIME_ASSETS, (p, id) => onProgress?.(p, id));
  const products = new ProductRenderer(game.assets, game.lib, game.scene);
  // Навигация: сетка зала, крыльца и двора магазина + граф дорог деревни.
  const nav = new NavGrid(SHOP_ORIGIN.x - 8.5, SHOP_ORIGIN.z - 11.5, SHOP_ORIGIN.x + 8.5, SHOP_ORIGIN.z + 6.5);
  nav.bakeStatic(game.village.colliders, 0.28, (tag) => tag !== 'npc' && tag !== 'box' && !tag.startsWith('furniture'));
  const roads = new RoadGraph();
  game.viewmodel = new Viewmodel(game.camera, game.lib, game.assets);
  game.overlay = { scene: game.viewmodel.scene, camera: game.viewmodel.camera };
  game.audio = new AudioSystem(game.settings.data.audio);
  game.saves = new SaveManager();
  game.ui = new UI(game);
  game.ui.icons.generate(['box_cardboard']);
  game.stock = new StockSystem(game, products, nav);
  game.counter = new CounterSystem(game);
  game.restorationView = new RestorationSystem(game);
  const dirt = new DirtSystem(game);
  game.customers = new CustomerSystem(game, nav, roads);
  const suppliers = new SupplierSystem(game);
  const player = new PlayerSystem(game);
  game.flow = new Flow(game);
  // Метла у прилавка (видна, когда не в руках).
  const broom = game.assets.instance('broom');
  broom.position.set(SHOP_ORIGIN.x + 6.62, FLOOR_Y, SHOP_ORIGIN.z - 5.0);
  broom.rotation.set(0, 0.5, -0.22);
  game.scene.add(broom);
  game.addSystem(player);
  game.addSystem(game.stock);
  game.addSystem(game.counter);
  game.addSystem(game.restorationView);
  game.addSystem(dirt);
  game.addSystem(game.customers);
  game.addSystem(suppliers);
  game.addSystem(game.flow);
  game.addSystem({
    update: (_dt, frameDt) => {
      game.ui.update(frameDt);
      game.audio.update(frameDt, game.mode === 'play' || game.mode === 'menu');
      broom.visible = game.sim.state.player.tool !== 'broom';
    },
  });
  void THREE;
}
