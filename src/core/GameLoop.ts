/**
 * Игровой цикл на requestAnimationFrame. dt — реальная дельта, ограниченная сверху,
 * чтобы после сворачивания вкладки симуляция не «прыгала».
 */
export class GameLoop {
  private running = false;
  private last = 0;
  private rafId = 0;
  private accumFps = 0;
  private frames = 0;
  fps = 0;
  /** 0 — без ограничения (VSync браузера), иначе целевой FPS. */
  fpsLimit = 0;
  private sinceLastFrame = 0;
  /** Верхняя граница шага (для автотестов можно поднять: ?maxdt=0.25). */
  maxDt = 1 / 20;
  /** Номер кадра. */
  frameNo = 0;

  constructor(private readonly tick: (dt: number, realDt: number) => void) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.rafId = requestAnimationFrame(this.frame);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
  }

  private frame = (now: number): void => {
    if (!this.running) return;
    this.rafId = requestAnimationFrame(this.frame);
    const realDt = Math.max(0, (now - this.last) / 1000);
    if (this.fpsLimit > 0) {
      this.sinceLastFrame += realDt;
      this.last = now;
      const target = 1 / this.fpsLimit;
      if (this.sinceLastFrame < target * 0.95) return;
      const dt = Math.min(this.sinceLastFrame, this.maxDt);
      this.frameNo++;
      this.account(this.sinceLastFrame);
      this.sinceLastFrame = 0;
      this.tick(dt, dt);
      return;
    }
    this.last = now;
    this.account(realDt);
    this.frameNo++;
    this.tick(Math.min(realDt, this.maxDt), Math.min(realDt, this.maxDt));
  };

  private account(dt: number): void {
    this.accumFps += dt;
    this.frames++;
    if (this.accumFps >= 0.5) {
      this.fps = Math.round(this.frames / this.accumFps);
      this.frames = 0;
      this.accumFps = 0;
    }
  }
}
