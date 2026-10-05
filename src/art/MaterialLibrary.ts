import * as THREE from 'three';
import * as TF from './TextureFactory';
import * as SF from './SignFactory';

/**
 * Общая библиотека материалов. Модели (из GLB или строителей) ссылаются на материалы
 * по имени; библиотека подставляет один общий экземпляр на имя. Так все дома делят
 * один материал «roof», все стены — «wood» и т. д. (минимум переключений состояния GPU).
 */

type SignGen = () => HTMLCanvasElement;

const SIGNS: Record<string, SignGen> = {
  shop_old: () => SF.signShopOld(),
  shop_new: () => SF.signShopNew(),
  shop_gable: () => SF.signGablePainting(),
  grocery: () => SF.signSupplier('Бакалея', [228, 240, 232], [34, 94, 89], 41),
  bakery: () => SF.signSupplier('Пекарня', [246, 232, 196], [140, 72, 36], 42),
  produce: () => SF.signSupplier('Овощи и фрукты', [236, 238, 210], [62, 112, 52], 43),
  dairy: () => SF.signSupplier('Молочная ферма', [244, 244, 236], [52, 92, 120], 44),
  butcher: () => SF.signSupplier('Мясная лавка', [240, 226, 214], [125, 46, 58], 45),
  bus_stop: () => SF.signPlate('Остановка', 'Дубравка', [244, 238, 223], [47, 79, 63]),
  village: () => SF.signPlate('Дубравка', 'добро пожаловать', [244, 238, 223], [47, 79, 63]),
  chalk: () => SF.signChalkboard(['Свежий хлеб', 'Яблоки, вода']),
  open: () => SF.signOpenClosed(true),
  closed: () => SF.signOpenClosed(false),
  bus_route: () => SF.signPlate('7', 'Дубравка', [36, 64, 52], [244, 238, 223]),
  box_generic: () => SF.boxLabel('Товар', '#8a6a4a'),
  phone_call: () => SF.signPhoneCall(),
};

export class MaterialLibrary {
  private mats = new Map<string, THREE.Material>();
  private textures = new Map<string, THREE.Texture>();
  private anisotropy = 4;
  /** Материалы, яркость которых зависит от ночи. */
  private nightMats: { mat: THREE.MeshStandardMaterial; day: number; night: number }[] = [];
  readonly time = { value: 0 };
  private extraSigns = new Map<string, SignGen>();
  private unknownWarned = new Set<string>();

  setAnisotropy(a: number): void {
    this.anisotropy = a;
  }

  registerSign(id: string, gen: SignGen): void {
    this.extraSigns.set(id, gen);
  }

  tex(key: string, make: () => HTMLCanvasElement, opts: { repeat?: boolean; srgb?: boolean } = {}): THREE.Texture {
    let t = this.textures.get(key);
    if (!t) {
      t = TF.toTexture(make(), { ...opts, anisotropy: this.anisotropy });
      this.textures.set(key, t);
    }
    return t;
  }

  /** Получить материал по имени (создаётся лениво). */
  get(name: string): THREE.Material {
    let m = this.mats.get(name);
    if (m) return m;
    m = this.create(name);
    m.name = name;
    this.mats.set(name, m);
    return m;
  }

  has(name: string): boolean {
    return this.mats.has(name);
  }

  private std(params: THREE.MeshStandardMaterialParameters): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0, ...params });
  }

  private create(name: string): THREE.Material {
    if (name.startsWith('sign:')) {
      const id = name.slice(5);
      const gen = this.extraSigns.get(id) ?? SIGNS[id];
      if (!gen) return this.std({ color: 0xff00ff });
      const map = this.tex(name, gen, { repeat: false });
      return this.std({ map, roughness: 0.9 });
    }
    if (name.startsWith('awning:')) {
      const kind = name.slice(7);
      const colors: Record<string, [string, string]> = {
        yellow: ['#e9a43c', '#f6ead2'],
        red: ['#a8403a', '#f3e8d8'],
        green: ['#3f7d4c', '#467f52'],
        burgundy: ['#7d2e3a', '#efe2d2'],
        teal: ['#2f7f78', '#eef0e6'],
      };
      const [a, b] = colors[kind] ?? colors.green!;
      const map = this.tex(name, () => TF.stripesTexture(a, b, 8));
      return this.std({ map, roughness: 0.95, side: THREE.DoubleSide, vertexColors: false });
    }
    switch (name) {
      case 'flat':
        return this.std({});
      case 'flatDouble':
        return this.std({ side: THREE.DoubleSide });
      case 'wood':
        return this.std({ map: this.tex('planks', () => TF.planksTexture(1)), roughness: 0.82 });
      case 'woodgrain':
        return this.std({ map: this.tex('woodgrain', () => TF.woodgrainTexture(2)), roughness: 0.8 });
      case 'plaster':
        return this.std({ map: this.tex('plaster', () => TF.plasterTexture(7)), roughness: 0.95 });
      case 'roof':
        return this.std({ map: this.tex('shingles', () => TF.shinglesTexture(3)), roughness: 0.82 });
      case 'roofRow':
        return this.std({ map: this.tex('shingleRow', () => TF.shingleRowTexture(15)), roughness: 0.8 });
      case 'stone':
        return this.std({ map: this.tex('stonewall', () => TF.stoneWallTexture(5)), roughness: 0.95 });
      case 'cobble':
        return this.std({ map: this.tex('cobble', () => TF.cobbleTexture(4)), roughness: 0.92 });
      case 'brick':
        return this.std({ map: this.tex('brick', () => TF.brickTexture(6)), roughness: 0.92 });
      case 'fabric':
        return this.std({ map: this.tex('fabric', () => TF.fabricTexture(8)), roughness: 1, side: THREE.DoubleSide });
      case 'metal':
        return this.std({ roughness: 0.5, metalness: 0.35 });
      case 'chrome':
        return this.std({ roughness: 0.22, metalness: 0.85 });
      case 'plastic':
        return this.std({ roughness: 0.45 });
      case 'glass':
        return new THREE.MeshStandardMaterial({
          color: 0xd8ecf0,
          roughness: 0.05,
          metalness: 0.1,
          transparent: true,
          opacity: 0.18,
          depthWrite: false,
          side: THREE.DoubleSide,
        });
      case 'glassFrost':
        return new THREE.MeshStandardMaterial({
          color: 0xe6f2f6,
          roughness: 0.3,
          metalness: 0,
          transparent: true,
          opacity: 0.45,
          depthWrite: false,
        });
      case 'window': {
        // Окна жилых домов: тёмное стекло днём, тёплый свет ночью.
        const m = this.std({ roughness: 0.18, metalness: 0.25, emissive: new THREE.Color(0xffb35c), emissiveIntensity: 0 });
        this.nightMats.push({ mat: m, day: 0, night: 1.1 });
        return m;
      }
      case 'emissive': {
        // Плафоны фонарей и ламп: слегка светятся днём, ярко — ночью.
        const m = this.std({ emissive: new THREE.Color(0xffd08a), emissiveIntensity: 0.25, roughness: 0.4 });
        this.nightMats.push({ mat: m, day: 0.25, night: 3.2 });
        return m;
      }
      case 'emissiveAlways':
        return this.std({ emissive: new THREE.Color(0xfff2d8), emissiveIntensity: 1.2, roughness: 0.5 });
      case 'screen':
        return this.std({ emissive: new THREE.Color(0x9fd8c8), emissiveIntensity: 0.6, roughness: 0.3 });
      case 'foliage':
        return this.windy(this.std({ roughness: 0.9 }), 0.035);
      case 'grassBlade':
        return this.windy(this.std({ roughness: 0.95, side: THREE.DoubleSide }), 0.35);
      case 'foliageStatic':
        return this.std({ roughness: 0.9 });
      case 'paper':
        return this.std({ roughness: 0.95, side: THREE.DoubleSide });
      case 'decal:stain':
        return this.decal(this.tex('d_stain', () => TF.stainDecal()));
      case 'decal:footprints':
        return this.decal(this.tex('d_foot', () => TF.footprintsDecal()));
      case 'decal:mud':
        return this.decal(this.tex('d_mud', () => TF.mudDecal()));
      case 'decal:cobweb':
        return this.decal(this.tex('d_web', () => TF.cobwebDecal()), THREE.DoubleSide);
      case 'decal:shadow':
        return this.decal(this.tex('d_shadow', () => TF.blobShadow()));
      default:
        if (!this.unknownWarned.has(name)) {
          this.unknownWarned.add(name);
          console.warn(`[MaterialLibrary] неизвестный материал «${name}» — используется flat`);
        }
        return this.std({});
    }
  }

  private decal(map: THREE.Texture, side: THREE.Side = THREE.FrontSide): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({
      map,
      transparent: true,
      depthWrite: false,
      roughness: 1,
      metalness: 0,
      side,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
  }

  /** Лёгкое покачивание на ветру (вершинный шейдер), амплитуда растёт с высотой. */
  private windy(m: THREE.MeshStandardMaterial, amp: number): THREE.MeshStandardMaterial {
    const time = this.time;
    m.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = time;
      shader.uniforms.uWindAmp = { value: amp };
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform float uWindAmp;')
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          {
            vec4 wpos = vec4(position, 1.0);
            #ifdef USE_BATCHING
              wpos = batchingMatrix * wpos;
            #endif
            #ifdef USE_INSTANCING
              wpos = instanceMatrix * wpos;
            #endif
            wpos = modelMatrix * wpos;
            float h = max(position.y, 0.0);
            float s = sin(uTime * 1.4 + wpos.x * 0.31 + wpos.z * 0.23) + 0.5 * sin(uTime * 2.3 + wpos.x * 0.7);
            transformed.x += s * uWindAmp * h;
            transformed.z += s * uWindAmp * h * 0.6;
          }`,
        );
    };
    m.customProgramCacheKey = () => `windy_${amp}`;
    return m;
  }

  /** Заменить материалы-заглушки на общие (по имени). */
  apply(root: THREE.Object3D): void {
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      if (Array.isArray(mesh.material)) {
        mesh.material = mesh.material.map((mm) => this.get(mm.name || 'flat'));
      } else {
        const nm = (mesh.material as THREE.Material).name || 'flat';
        mesh.material = this.get(nm);
      }
    });
  }

  /** 0 — день, 1 — ночь. */
  setNight(t: number): void {
    for (const nm of this.nightMats) nm.mat.emissiveIntensity = nm.day + (nm.night - nm.day) * t;
  }

  update(dt: number): void {
    this.time.value += dt;
  }
}
