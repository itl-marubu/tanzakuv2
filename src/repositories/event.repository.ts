import { count, desc, eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { type EventRow, event, tanzaku } from "../db/schema";

export type EventWithCount = EventRow & { tanzakuCount: number };

export class EventRepository {
  constructor(private readonly db: Db) {}

  async insert(row: typeof event.$inferInsert): Promise<EventRow> {
    const [created] = await this.db.insert(event).values(row).returning();
    return created;
  }

  async findById(id: string): Promise<EventRow | null> {
    const rows = await this.db
      .select()
      .from(event)
      .where(eq(event.id, id))
      .limit(1);
    return rows[0] ?? null;
  }

  async findActive(): Promise<EventRow | null> {
    const rows = await this.db
      .select()
      .from(event)
      .where(eq(event.isActive, true))
      .limit(1);
    return rows[0] ?? null;
  }

  async findAllWithCount(): Promise<EventWithCount[]> {
    const rows = await this.db
      .select({ event, tanzakuCount: count(tanzaku.id) })
      .from(event)
      .leftJoin(tanzaku, eq(tanzaku.eventId, event.id))
      .groupBy(event.id)
      .orderBy(desc(event.createdAt));
    return rows.map((r) => ({ ...r.event, tanzakuCount: r.tanzakuCount }));
  }

  /** 全イベントを無効化してから対象のみ有効化する(D1 batch でアトミックに) */
  async activateExclusively(id: string): Promise<void> {
    await this.db.batch([
      this.db.update(event).set({ isActive: false }),
      this.db.update(event).set({ isActive: true }).where(eq(event.id, id))
    ]);
  }

  async deactivateAll(): Promise<void> {
    await this.db.update(event).set({ isActive: false });
  }
}
