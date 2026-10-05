import type { GameState, Phase } from '../game/state';
import { Sim } from '../game/Sim';

/**
 * Сохранения в IndexedDB: база dubravka-saves, хранилище saves, ключи slot1..slot3 и autosave.
 * Запись = { meta, state }. Состояние — чистые данные (без three.js), версия и миграции в Sim.migrate.
 * Если IndexedDB недоступна (приватный режим), сохранения живут в памяти до перезагрузки.
 */

export type SaveKey = 'slot1' | 'slot2' | 'slot3' | 'autosave';
export const SAVE_KEYS: SaveKey[] = ['slot1', 'slot2', 'slot3', 'autosave'];

export interface SaveMeta {
  slot: SaveKey;
  version: number;
  savedAt: number;
  day: number;
  minutes: number;
  phase: Phase;
  money: number;
  level: number;
  playTimeSec: number;
}

interface SaveRecord {
  meta: SaveMeta;
  state: GameState;
}

const DB_NAME = 'dubravka-saves';
const STORE = 'saves';

export class SaveManager {
  private db: Promise<IDBDatabase | null>;
  private memory = new Map<SaveKey, SaveRecord>();
  available = true;

  constructor() {
    this.db = new Promise((resolve) => {
      try {
        if (!('indexedDB' in window)) {
          this.available = false;
          resolve(null);
          return;
        }
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => {
          this.available = false;
          resolve(null);
        };
        req.onblocked = () => {
          this.available = false;
          resolve(null);
        };
      } catch {
        this.available = false;
        resolve(null);
      }
    });
  }

  private async tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> {
    const db = await this.db;
    if (!db) return undefined;
    return new Promise((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      const req = fn(t.objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  static metaOf(slot: SaveKey, s: GameState): SaveMeta {
    return { slot, version: s.version, savedAt: Date.now(), day: s.day, minutes: s.minutes, phase: s.phase, money: s.money, level: s.level, playTimeSec: s.playTimeSec };
  }

  async save(slot: SaveKey, state: GameState): Promise<boolean> {
    const rec: SaveRecord = { meta: SaveManager.metaOf(slot, state), state };
    try {
      const db = await this.db;
      if (!db) {
        this.memory.set(slot, structuredClone(rec));
        return true;
      }
      await this.tx('readwrite', (s) => s.put(rec, slot));
      return true;
    } catch (e) {
      console.error('[SaveManager] не удалось сохранить', e);
      return false;
    }
  }

  async load(slot: SaveKey): Promise<GameState | null> {
    try {
      const db = await this.db;
      const rec = db ? await this.tx<SaveRecord>('readonly', (s) => s.get(slot) as IDBRequest<SaveRecord>) : this.memory.get(slot);
      if (!rec) return null;
      return Sim.migrate(structuredClone(rec.state));
    } catch (e) {
      console.error('[SaveManager] не удалось загрузить', e);
      throw e;
    }
  }

  async remove(slot: SaveKey): Promise<void> {
    const db = await this.db;
    if (!db) {
      this.memory.delete(slot);
      return;
    }
    await this.tx('readwrite', (s) => s.delete(slot));
  }

  async list(): Promise<Partial<Record<SaveKey, SaveMeta>>> {
    const out: Partial<Record<SaveKey, SaveMeta>> = {};
    for (const k of SAVE_KEYS) {
      try {
        const db = await this.db;
        const rec = db ? await this.tx<SaveRecord>('readonly', (s) => s.get(k) as IDBRequest<SaveRecord>) : this.memory.get(k);
        if (rec?.meta) out[k] = rec.meta;
      } catch {
        /* повреждённая запись — пропускаем */
      }
    }
    return out;
  }

  /** Самое свежее сохранение (для «Продолжить»). */
  async latest(): Promise<SaveMeta | null> {
    const all = await this.list();
    let best: SaveMeta | null = null;
    for (const m of Object.values(all)) if (m && (!best || m.savedAt > best.savedAt)) best = m;
    return best;
  }
}

export const SLOT_LABEL: Record<SaveKey, string> = {
  slot1: 'Слот 1',
  slot2: 'Слот 2',
  slot3: 'Слот 3',
  autosave: 'Автосохранение',
};
