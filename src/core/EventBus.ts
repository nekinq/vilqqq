type Handler<T> = (payload: T) => void;

/** Типизированная шина событий. Сервисы публикуют, виды и UI подписываются. */
export class EventBus<Events extends object> {
  private handlers = new Map<keyof Events, Set<Handler<never>>>();

  on<K extends keyof Events>(type: K, fn: Handler<Events[K]>): () => void {
    let set = this.handlers.get(type);
    if (!set) {
      set = new Set();
      this.handlers.set(type, set);
    }
    set.add(fn as Handler<never>);
    return () => this.off(type, fn);
  }

  once<K extends keyof Events>(type: K, fn: Handler<Events[K]>): () => void {
    const off = this.on(type, (p) => {
      off();
      fn(p);
    });
    return off;
  }

  off<K extends keyof Events>(type: K, fn: Handler<Events[K]>): void {
    this.handlers.get(type)?.delete(fn as Handler<never>);
  }

  emit<K extends keyof Events>(type: K, payload: Events[K]): void {
    const set = this.handlers.get(type);
    if (!set || set.size === 0) return;
    for (const fn of [...set]) {
      try {
        (fn as Handler<Events[K]>)(payload);
      } catch (err) {
        console.error(`[EventBus] ошибка в обработчике «${String(type)}»`, err);
      }
    }
  }

  clear(): void {
    this.handlers.clear();
  }
}
