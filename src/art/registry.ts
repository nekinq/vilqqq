import type * as THREE from 'three';

/** Статусы ассета (Docs/AssetBriefs.md). */
export type AssetStatus = 'planned' | 'concept-approved' | 'modeling' | 'exported' | 'integrated' | 'verified' | 'visual-approved';

export type AssetCategory =
  | 'shop'
  | 'restoration'
  | 'equipment'
  | 'product'
  | 'tool'
  | 'supplier'
  | 'house'
  | 'village'
  | 'nature'
  | 'vehicle'
  | 'character';

export interface AssetDef {
  id: string;
  name: string;
  category: AssetCategory;
  /** Функция в игре. */
  func: string;
  /** Референс (файл в Docs/Visual или бриф). */
  ref: string;
  pivot: string;
  collider: string;
  anims: string;
  lod: string;
  status: AssetStatus;
  build: () => THREE.Object3D;
  /** Не экспортировать в GLB (строится на лету, например, с параметрами). */
  runtimeOnly?: boolean;
}

const REGISTRY = new Map<string, AssetDef>();

export function defineAsset(def: Omit<AssetDef, 'pivot' | 'collider' | 'anims' | 'lod' | 'status'> & Partial<AssetDef>): AssetDef {
  const full: AssetDef = {
    pivot: 'центр основания',
    collider: 'данные карты',
    anims: '—',
    lod: '—',
    status: 'integrated',
    ...def,
  };
  REGISTRY.set(full.id, full);
  return full;
}

export function getAssetDef(id: string): AssetDef | undefined {
  return REGISTRY.get(id);
}

export function allAssets(): AssetDef[] {
  return [...REGISTRY.values()];
}

export function glbPath(id: string): string {
  return `assets/models/${id}.glb`;
}
