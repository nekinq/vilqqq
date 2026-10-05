import type { Ctx } from '../economy/Economy';
import { BALANCE } from '../data/balance';

/**
 * Фазы дня. Подготовка: 08:00, часы стоят. Смена: 08:00 → 23:00 (900 с, 1 с = 1 мин).
 * Закрытие: новые не приходят, текущие дообслуживаются, часы идут как обычно (без прыжка к 23:00).
 * Отчёт: «Начать новый день» срабатывает один раз (токен дня).
 */
export class TimeService {
  constructor(private readonly ctx: Ctx) {}

  private get s() {
    return this.ctx.state;
  }

  get running(): boolean {
    return this.s.phase === 'open' || this.s.phase === 'closing';
  }

  open(): boolean {
    if (this.s.phase !== 'preparation') return false;
    this.s.phase = 'open';
    this.s.minutes = BALANCE.dayStart;
    this.ctx.events.emit('phase', { phase: 'open', day: this.s.day });
    return true;
  }

  /** Ранее закрытие (или в 23:00 автоматически). */
  close(): boolean {
    if (this.s.phase !== 'open') return false;
    this.s.phase = 'closing';
    this.ctx.events.emit('phase', { phase: 'closing', day: this.s.day });
    return true;
  }

  /** Тик времени. busy — есть ли ещё покупатели/касса. Возвращает true, если день закончился. */
  update(dt: number, busy: boolean): boolean {
    if (!this.running) return false;
    this.s.minutes += dt * BALANCE.minutesPerSecond;
    if (this.s.phase === 'open' && this.s.minutes >= BALANCE.dayEnd) this.close();
    if (this.s.phase === 'closing' && !busy) {
      this.s.phase = 'report';
      this.ctx.events.emit('phase', { phase: 'report', day: this.s.day });
      return true;
    }
    return false;
  }

  /** Новый день: только из отчёта и только для текущего токена. */
  startNewDay(token: number): boolean {
    if (this.s.phase !== 'report' || token !== this.s.dayToken) return false;
    this.s.dayToken++;
    this.s.day++;
    this.s.minutes = BALANCE.dayStart;
    this.s.phase = 'preparation';
    this.ctx.events.emit('newDay', { day: this.s.day });
    this.ctx.events.emit('phase', { phase: 'preparation', day: this.s.day });
    return true;
  }

  /** Доля прошедшей смены (0..1). */
  progress(): number {
    return Math.min(1, Math.max(0, (this.s.minutes - BALANCE.dayStart) / (BALANCE.dayEnd - BALANCE.dayStart)));
  }
}
