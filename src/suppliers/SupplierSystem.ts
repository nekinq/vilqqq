import * as THREE from 'three';
import type { Game, System } from '../game/Game';
import { hitBox } from '../player/Interaction';
import { CharacterRig } from '../customers/CharacterRig';
import { SUPPLIERS, SUPPLIER_ORDER } from '../data/suppliers';
import type { SupplierId } from '../data/products';
import { groundHeight } from '../world/Ground';

interface Vendor {
  id: SupplierId;
  obj: THREE.Object3D;
  rig: CharacterRig;
  baseYaw: number;
  talking: boolean;
}

/**
 * Поставщики у своих прилавков (BLD-01): продавец-персонаж, «Познакомиться» / «Поговорить» (E),
 * реплики первой встречи, затем каталог. Доставка — к навесу у склада.
 */
export class SupplierSystem implements System {
  private vendors: Vendor[] = [];
  private root = new THREE.Group();

  constructor(private readonly game: Game) {
    this.root.name = 'suppliers';
    game.scene.add(this.root);
    for (const id of SUPPLIER_ORDER) {
      const spot = game.village.supplierSpots.get(id);
      if (!spot) continue;
      const def = SUPPLIERS[id];
      const obj = game.assets.instance(def.characterId);
      obj.position.set(spot.vendor.x, groundHeight(spot.vendor.x, spot.vendor.z), spot.vendor.z);
      obj.rotation.y = spot.vendorRotY;
      this.root.add(obj);
      const v: Vendor = { id, obj, rig: new CharacterRig(obj), baseYaw: spot.vendorRotY, talking: false };
      this.vendors.push(v);
      // Хитбокс: продавец и прилавок (игрок стоит снаружи, перед прилавком).
      const dx = spot.customer.x - spot.vendor.x;
      const dz = spot.customer.z - spot.vendor.z;
      const dl = Math.hypot(dx, dz) || 1;
      const hit = hitBox(2.2, 2.0, Math.min(1.5, dl * 0.75));
      const k = Math.min(1.5, dl * 0.75) / 2 - 0.2;
      hit.position.set(spot.vendor.x + (dx / dl) * k, 1.0, spot.vendor.z + (dz / dl) * k);
      hit.rotation.y = spot.vendorRotY;
      this.root.add(hit);
      game.interaction.register({
        id: `vendor:${id}`,
        hits: [hit],
        reach: 3.4,
        prompt: () => {
          const met = game.sim.state.suppliersMet.includes(id);
          if (game.sim.state.player.held.kind !== 'none') return { parts: [{ action: 'interact', text: `${met ? 'Заказать' : 'Познакомиться'}: ${def.title}` }], note: 'Руки заняты, но поговорить можно' };
          return { parts: [{ action: 'interact', text: met ? `Заказать товар — ${def.vendorName}` : `Познакомиться — ${def.vendorName}` }] };
        },
        onInteract: () => void this.talk(v),
      });
    }
  }

  private async talk(v: Vendor): Promise<void> {
    const game = this.game;
    const sim = game.sim;
    const def = SUPPLIERS[v.id];
    if (v.talking) return;
    v.talking = true;
    v.rig.nod(1.6);
    const met = sim.state.suppliersMet.includes(v.id);
    try {
      if (!met) {
        await game.ui.say(def.firstMeet.map((text) => ({ who: def.vendorName, text })), { onLine: () => v.rig.nod(1) });
        if (sim.orders.meet(v.id)) {
          const n = sim.state.suppliersMet.length;
          game.ui.toast(`Знакомство: ${def.title} (${n}/5)`, 'good');
          game.audio.play('success');
        }
      } else {
        await game.ui.say([{ who: def.vendorName, text: sim.rng.pick(def.greetings) }]);
      }
      game.ui.openCatalog(v.id, false);
    } finally {
      v.talking = false;
    }
  }

  update(dt: number, frameDt: number): void {
    const pl = this.game.player.position;
    for (const v of this.vendors) {
      const dx = pl.x - v.obj.position.x;
      const dz = pl.z - v.obj.position.z;
      const d = Math.hypot(dx, dz);
      let yaw = 0;
      if (d < 7 && this.game.mode === 'play') {
        yaw = Math.atan2(dx, dz) - v.baseYaw;
        while (yaw > Math.PI) yaw -= Math.PI * 2;
        while (yaw < -Math.PI) yaw += Math.PI * 2;
      }
      v.rig.lookYaw = yaw;
      v.rig.update(frameDt, 0);
    }
    void dt;
  }
}
