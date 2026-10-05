import * as THREE from 'three';
import { Settings, PRESETS } from '../core/Settings';
import { RenderSystem } from '../core/Renderer';
import { Input } from '../core/Input';
import { GameLoop } from '../core/GameLoop';
import { AssetManager, type AssetSource } from '../core/AssetManager';
import { MaterialLibrary } from '../art/MaterialLibrary';
import { Village } from '../world/Village';
import { Doors } from '../world/Doors';
import { Sim } from './Sim';
import { PlayerController } from '../player/PlayerController';
import { Interaction, type Prompt } from '../player/Interaction';
import { HUD } from '../ui/HUD';
import { groundHeight } from '../world/Ground';
import { PLAYER_ARRIVAL } from '../world/layout';
import type { GameState } from './state';
import { h } from '../ui/dom';
import type { UI } from '../ui/UI';
import type { AudioSystem } from '../audio/Audio';
import type { Viewmodel } from '../player/Viewmodel';
import type { StockSystem } from '../inventory/StockSystem';
import type { Flow } from './Flow';
import type { SaveManager } from '../save/SaveManager';
import type { CounterSystem } from '../checkout/CounterSystem';
import type { CustomerSystem } from '../customers/CustomerSystem';
import type { RestorationSystem } from '../cleaning/RestorationSystem';

export type GameMode = 'loading' | 'menu' | 'intro' | 'play' | 'paused';

/** Подсистемы, которые обновляются в игровом цикле. */
export interface System {
  /** dt — игровое время (0 на паузе и в меню), frameDt — реальное время кадра. */
  update(dt: number, frameDt: number): void;
  /** Пересобрать вид из состояния (новая игра / загрузка). */
  rebuild?(): void;
  dispose?(): void;
}

/**
 * Главный объект игры: владеет рендером, вводом, ассетами, миром, симуляцией, игроком и UI.
 * Логика симуляции — в Sim (без three.js), виды — в системах (подключаются в systems.ts).
 */
export class Game {
  readonly settings = new Settings();
  readonly render: RenderSystem;
  readonly input: Input;
  readonly lib = new MaterialLibrary();
  readonly assets: AssetManager;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly uiRoot: HTMLElement;
  village!: Village;
  doors!: Doors;
  readonly sim = new Sim();
  player!: PlayerController;
  interaction!: Interaction;
  hud!: HUD;
  readonly loop: GameLoop;
  mode: GameMode = 'loading';
  readonly systems: System[] = [];
  /** Сколько модальных окон открыто (планшет, каталог...): курсор отпущен, игровой ввод выключен. */
  modals = 0;
  /** Открыт ли планшет (для HUD). */
  tabletOpen = false;
  private clickResume: HTMLElement | null = null;
  private hudTimer = 0;
  /** Агенты рядом с дверями (игрок + NPC). */
  readonly doorAgents: { x: number; z: number }[] = [];
  readonly npcPositions: { x: number; z: number }[] = [];

  // Системы (создаются в systems.ts).
  ui!: UI;
  audio!: AudioSystem;
  viewmodel!: Viewmodel;
  stock!: StockSystem;
  counter!: CounterSystem;
  customers!: CustomerSystem;
  flow!: Flow;
  saves!: SaveManager;
  restorationView!: RestorationSystem;
  /** Время суток для фона меню (вместо игрового). */
  timeOverride: number | null = null;

  /** Второй проход (вьюмодель рук). */
  overlay: { scene: THREE.Scene; camera: THREE.Camera } | null = null;
  /** Перехват ввода до взаимодействия (режим расстановки). true — ввод съеден. */
  inputHook: (() => boolean) | null = null;
  /** Подсказка вместо обычной (режим расстановки). */
  promptOverride: (() => Prompt | null) | null = null;
  /** Камера управляется кат-сценой/меню (игрок не двигает её). */
  cameraDriven = false;

  constructor(params: URLSearchParams) {
    const viewport = document.getElementById('viewport')!;
    this.uiRoot = document.getElementById('ui-root')!;
    this.render = new RenderSystem(viewport);
    this.render.applySettings(this.settings.data.graphics);
    this.lib.setAnisotropy(Math.min(8, this.render.renderer.capabilities.getMaxAnisotropy()));
    const src = (params.get('src') as AssetSource | null) ?? (import.meta.env.DEV ? 'procedural' : 'glb');
    this.assets = new AssetManager(this.lib, src);
    this.camera = new THREE.PerspectiveCamera(72, this.render.aspect, 0.05, this.settings.data.graphics.drawDistance + 30);
    this.scene.add(this.camera);
    this.input = new Input(this.render.canvas, this.settings);
    this.loop = new GameLoop((dt, real) => this.tick(dt, real));
    this.testMode = params.has('test');
    const maxdt = Number(params.get('maxdt'));
    if (maxdt > 0) this.loop.maxDt = Math.min(1, maxdt);
    const q = params.get('quality');
    if (q === 'low' || q === 'medium' || q === 'high') this.settings.data.graphics = { ...this.settings.data.graphics, ...PRESETS[q] };
    window.addEventListener('resize', () => {
      this.camera.aspect = this.render.aspect;
      this.camera.updateProjectionMatrix();
    });
    this.settings.events.on('changed', (s) => this.applySettings(s));
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.mode === 'play' && !this.testMode) this.pause();
    });
    window.addEventListener('beforeunload', (e) => {
      if ((this.mode === 'play' || this.mode === 'paused') && !this.allowUnload) {
        e.preventDefault();
        e.returnValue = '';
      }
    });
    this.input.onPointerLockLost = () => {
      if (this.mode === 'play' && this.modals === 0 && !this.testMode) this.pause();
    };
    this.input.onPointerLockFailed = () => this.showClickToResume();
  }

  /** Разрешить уход со страницы без предупреждения (после сохранения / выхода в меню). */
  allowUnload = false;
  /** Режим автотестов (?test): без захвата указателя и подсказки «нажмите». */
  readonly testMode: boolean;

  get quality(): 'low' | 'medium' | 'high' {
    return this.settings.data.graphics.preset;
  }

  async init(onProgress: (p: number, label: string) => void): Promise<void> {
    this.village = new Village(this.scene, this.assets, this.lib, this.quality, this.render.renderer);
    await this.village.build(onProgress);
    this.doors = new Doors(this.village.shop);
    this.player = new PlayerController(this.camera, this.input, this.settings, this.village.colliders, this.village.floors);
    this.interaction = new Interaction(this.camera, this.input);
    this.interaction.floorHeight = (x, z) => this.village.floors.heightAt(x, z, groundHeight(x, z));
    this.village.shop.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      if (mats.every((m) => !m.transparent)) this.interaction.addOccluder(o);
    });
    this.hud = new HUD(this.uiRoot, this.settings);
    this.hud.setVisible(false);
    this.applySettings(this.settings.data);
    this.player.teleport(PLAYER_ARRIVAL.x, PLAYER_ARRIVAL.z);
    this.player.lookAt(PLAYER_ARRIVAL.lookX, 1.6, PLAYER_ARRIVAL.lookZ);
    this.loop.start();
  }

  addSystem(s: System): void {
    this.systems.push(s);
  }

  applySettings(s: Settings['data']): void {
    this.render.applySettings(s.graphics);
    this.loop.fpsLimit = s.graphics.fpsLimit;
    this.camera.far = s.graphics.drawDistance + 30;
    this.camera.updateProjectionMatrix();
    if (this.village?.dayNight) {
      this.village.dayNight.setDrawDistance(s.graphics.drawDistance);
      this.village.dayNight.setShadowQuality(s.graphics.shadows);
    }
    this.audio?.applySettings(s.audio);
    if (!s.general.showFps) this.hud?.setFps(null);
  }

  // ───────── Состояние и режимы ─────────

  /** Новая игра / загрузка: заменить состояние симуляции и пересобрать виды. */
  setState(state: GameState): void {
    this.sim.load(state);
    for (const s of this.systems) s.rebuild?.();
    const p = state.player;
    this.player.teleport(p.x, p.z, p.yaw, p.pitch);
  }

  /** Сохранить позицию игрока в состояние перед сериализацией. */
  capturePlayer(): void {
    const p = this.sim.state.player;
    p.x = this.player.position.x;
    p.y = this.player.position.y;
    p.z = this.player.position.z;
    p.yaw = this.player.yaw;
    p.pitch = this.player.pitch;
  }

  newGame(opts: { skipIntro: boolean }): void {
    this.flow.newGame(opts);
  }

  showMainMenu(): void {
    this.flow.showMainMenu();
  }

  setMode(m: GameMode): void {
    this.mode = m;
    const playing = m === 'play';
    this.updateInputState();
    this.hud.setVisible(playing || m === 'intro');
    this.hud.setCinematic(m === 'intro');
    this.hud.setCrosshair(playing);
    if (!playing) this.hideClickToResume();
  }

  private updateInputState(): void {
    const playing = this.mode === 'play';
    const free = playing && this.modals === 0;
    this.input.gameplayEnabled = free;
    this.input.wantPointerLock = free;
    this.interaction.enabled = free;
    this.player.frozen = !free;
    this.player.lookFrozen = !free;
    if (free) this.input.requestLock();
    else this.input.exitLock();
  }

  /** Открыть/закрыть модальное окно (курсор отпускается, время идёт). */
  pushModal(): void {
    this.modals++;
    this.updateInputState();
  }

  popModal(): void {
    this.modals = Math.max(0, this.modals - 1);
    this.updateInputState();
  }

  pause(): void {
    if (this.mode !== 'play') return;
    this.mode = 'paused';
    this.updateInputState();
    this.hud.setCrosshair(false);
    this.ui?.showPause();
  }

  resume(): void {
    if (this.mode !== 'paused') return;
    this.mode = 'play';
    this.hud.setCrosshair(true);
    this.updateInputState();
  }

  private showClickToResume(): void {
    if (this.testMode || this.clickResume || this.mode !== 'play' || this.modals > 0) return;
    const el = h('div', { class: 'click-resume' }, h('div', null, 'Нажмите, чтобы продолжить'));
    el.addEventListener('click', () => {
      this.hideClickToResume();
      this.input.requestLock();
    });
    this.uiRoot.append(el);
    this.clickResume = el;
  }

  private hideClickToResume(): void {
    this.clickResume?.remove();
    this.clickResume = null;
  }

  // ───────── Цикл ─────────

  private tick(dt: number, _real: number): void {
    this.input.beginFrame();
    if (this.mode === 'play' && this.input.locked) this.hideClickToResume();
    this.ui?.handleHotkeys();
    const simDt = this.mode === 'play' || this.mode === 'intro' ? dt : 0;
    if (this.mode === 'play') {
      this.player.update(dt);
      const eaten = this.modals === 0 && this.inputHook ? this.inputHook() : false;
      this.interaction.passive = eaten;
      this.interaction.update(dt);
    }
    for (const s of this.systems) s.update(simDt, dt);
    // Двери: игрок + NPC.
    this.doorAgents.length = 0;
    if (this.mode === 'play') this.doorAgents.push({ x: this.player.position.x, z: this.player.position.z });
    for (const p of this.npcPositions) this.doorAgents.push(p);
    this.doors.update(dt, this.doorAgents);
    this.village.dayNight.setTime(this.timeOverride ?? this.sim.state.minutes);
    this.village.update(dt, this.camera);
    this.render.render(this.scene, this.camera, this.mode === 'play' || this.mode === 'paused' ? (this.overlay ?? undefined) : undefined, this.village.dayNight.night);
    // HUD ~10 Гц.
    this.hudTimer -= dt;
    if (this.hudTimer <= 0 && this.mode !== 'loading') {
      this.hudTimer = 0.1;
      this.updateHud();
    }
    this.hud?.update(dt);
  }

  private updateHud(): void {
    const s = this.sim.state;
    this.hud.setTop(s.day, s.minutes, s.phase);
    this.hud.setStats(s.money, s.level, s.reputation);
    this.hud.setTool(s.player.tool, this.tabletOpen);
    this.hud.setFocus(!!this.interaction.focus);
    const prompt = this.promptOverride?.() ?? this.interaction.currentPrompt;
    this.hud.setPrompt(this.mode === 'play' && this.modals === 0 ? prompt : null);
    if (this.settings.data.general.showFps) {
      const st = this.render.stats;
      this.hud.setFps(`${this.loop.fps} FPS  calls ${st.calls}  tris ${(st.triangles / 1000).toFixed(0)}k`);
    }
  }
}
