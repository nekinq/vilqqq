import * as THREE from 'three';
import type { Game, System } from '../game/Game';
import type { DirtItem } from '../game/state';

interface DirtView {
  obj: THREE.Object3D;
  mat: THREE.MeshStandardMaterial | null;
}

/** Грязь от покупателей: следы и земля — декали на полу, бумажки — модели. Метла уменьшает «силу». */
export class DirtSystem implements System {
  private views = new Map<string, DirtView>();
  private root = new THREE.Group();
  private planes = new Map<string, THREE.PlaneGeometry>();
  private unsub: () => void;

  constructor(private readonly game: Game) {
    this.root.name = 'dirt';
    game.scene.add(this.root);
    this.unsub = game.sim.events.on('dirt', ({ id, removed }) => (removed ? this.remove(id) : this.sync(id)));
  }

  private plane(kind: string): THREE.PlaneGeometry {
    let g = this.planes.get(kind);
    if (!g) {
      g = kind === 'footprints' ? new THREE.PlaneGeometry(0.7, 1.3) : new THREE.PlaneGeometry(1.0, 1.0);
      this.planes.set(kind, g);
    }
    return g;
  }

  private create(d: DirtItem): DirtView {
    if (d.kind === 'paper') {
      const obj = this.game.assets.instance('paper_litter');
      obj.position.set(d.x, d.y, d.z);
      obj.rotation.y = d.rot;
      this.root.add(obj);
      return { obj, mat: null };
    }
    const base = this.game.lib.get(d.kind === 'mud' ? 'decal:mud' : 'decal:footprints') as THREE.MeshStandardMaterial;
    const mat = base.clone();
    const mesh = new THREE.Mesh(this.plane(d.kind), mat);
    mesh.rotation.set(-Math.PI / 2, 0, d.rot);
    mesh.position.set(d.x, d.y, d.z);
    mesh.receiveShadow = true;
    mesh.renderOrder = 1;
    this.root.add(mesh);
    return { obj: mesh, mat };
  }

  private sync(id: string): void {
    const d = this.game.sim.state.dirt.find((q) => q.id === id);
    if (!d) {
      this.remove(id);
      return;
    }
    let v = this.views.get(id);
    if (!v) {
      v = this.create(d);
      this.views.set(id, v);
    }
    if (v.mat) v.mat.opacity = Math.max(0, Math.min(1, d.strength)) * 0.92;
  }

  private remove(id: string): void {
    const v = this.views.get(id);
    if (!v) return;
    this.root.remove(v.obj);
    v.mat?.dispose();
    this.views.delete(id);
  }

  rebuild(): void {
    for (const id of [...this.views.keys()]) this.remove(id);
    for (const d of this.game.sim.state.dirt) this.sync(d.id);
  }

  update(): void {
    /* всё по событиям */
  }

  dispose(): void {
    this.unsub();
  }
}
