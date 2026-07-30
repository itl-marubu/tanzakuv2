import { createDb } from "../db/client";
import type { EventRow } from "../db/schema";
import { nowForDb, toApiDate } from "../lib/dates";
import { newUuid } from "../lib/id";
import { EventRepository } from "../repositories/event.repository";

// API レスポンス形(旧 Prisma + c.json と同一): createdAt は ISO 8601(Z)
const serialize = (row: EventRow) => ({
  ...row,
  createdAt: toApiDate(row.createdAt)
});

export class EventService {
  private readonly events: EventRepository;

  constructor(db: D1Database) {
    this.events = new EventRepository(createDb(db));
  }

  async createEvent(data: { name: string; description?: string }) {
    const created = await this.events.insert({
      id: newUuid(),
      name: data.name,
      description: data.description ?? null,
      createdAt: nowForDb()
    });
    return serialize(created);
  }

  /** 旧 Prisma の include._count と同じ {_count:{tanzakus:N}} 形で返す(管理画面互換) */
  async getAllEvents() {
    const rows = await this.events.findAllWithCount();
    return rows.map(({ tanzakuCount, ...row }) => ({
      ...serialize(row),
      _count: { tanzakus: tanzakuCount }
    }));
  }

  async getActiveEvent() {
    const row = await this.events.findActive();
    return row ? serialize(row) : null;
  }

  async activateEvent(id: string) {
    const event = await this.events.findById(id);
    if (!event) {
      throw new Error(`Event not found: ${id}`);
    }
    await this.events.activateExclusively(id);
    const activated = await this.events.findById(id);
    if (!activated) {
      // 直前に存在確認済みのため通常到達しないが、万一消えていた場合は
      // 呼び出し側に null 分岐を持たせず異常系として例外にする
      throw new Error(`Event not found after activation: ${id}`);
    }
    return serialize(activated);
  }

  async deactivateAll() {
    await this.events.deactivateAll();
  }
}
