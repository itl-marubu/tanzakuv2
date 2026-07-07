import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import type { Db } from "../db/client";
import {
  type TanzakuInsert,
  type TanzakuRow,
  event,
  tanzaku
} from "../db/schema";

export type TanzakuWithEvent = TanzakuRow & {
  event: { id: string; name: string } | null;
};

// eventId === null はレガシー(イベント制導入前)データを指す
const eventScope = (eventId: string | null) =>
  eventId === null ? isNull(tanzaku.eventId) : eq(tanzaku.eventId, eventId);

// ウォールに表示可能な短冊: 表示ローテーション中・適切判定・未削除
const displayable = (eventId: string | null) =>
  and(
    eq(tanzaku.visiblePattern, true),
    eq(tanzaku.validationResult, 0),
    eq(tanzaku.logicalDelete, false),
    eventScope(eventId)
  );

export class TanzakuRepository {
  constructor(private readonly db: Db) {}

  async insert(row: TanzakuInsert): Promise<TanzakuRow> {
    const [created] = await this.db.insert(tanzaku).values(row).returning();
    return created;
  }

  async findById(id: string): Promise<TanzakuRow | null> {
    const rows = await this.db
      .select()
      .from(tanzaku)
      .where(eq(tanzaku.id, id))
      .limit(1);
    return rows[0] ?? null;
  }

  async findAllWithEvent(): Promise<TanzakuWithEvent[]> {
    const rows = await this.db
      .select()
      .from(tanzaku)
      .leftJoin(event, eq(tanzaku.eventId, event.id))
      .orderBy(desc(tanzaku.createdAt));
    return rows.map((r) => ({
      ...r.Tanzaku,
      event: r.Event ? { id: r.Event.id, name: r.Event.name } : null
    }));
  }

  async existsDisplayable(eventId: string | null): Promise<boolean> {
    const rows = await this.db
      .select({ id: tanzaku.id })
      .from(tanzaku)
      .where(displayable(eventId))
      .limit(1);
    return rows.length > 0;
  }

  /** ローテーション一巡後のリセット: スコープ内の非表示分を全て表示可能に戻す */
  async resetVisibility(eventId: string | null): Promise<void> {
    await this.db
      .update(tanzaku)
      .set({ visiblePattern: true })
      .where(and(eq(tanzaku.visiblePattern, false), eventScope(eventId)));
  }

  async findDisplayable(
    limit: number,
    eventId: string | null
  ): Promise<TanzakuRow[]> {
    return this.db
      .select()
      .from(tanzaku)
      .where(displayable(eventId))
      .orderBy(desc(tanzaku.createdAt))
      .limit(limit);
  }

  async markHidden(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.db
      .update(tanzaku)
      .set({ visiblePattern: false })
      .where(inArray(tanzaku.id, ids));
  }

  async markLogicalDeleted(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.db
      .update(tanzaku)
      .set({ logicalDelete: true })
      .where(inArray(tanzaku.id, ids));
  }

  async hardDelete(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.db.delete(tanzaku).where(inArray(tanzaku.id, ids));
  }

  /** undefined のフィールドは変更しない。eventId は明示 null でレガシーへ移動 */
  async updateOne(
    id: string,
    patch: {
      content?: string;
      userName?: string;
      validationResult?: number;
      eventId?: string | null;
    }
  ): Promise<void> {
    const set: Partial<TanzakuInsert> = {};
    if (patch.content !== undefined) set.content = patch.content;
    if (patch.userName !== undefined) set.userName = patch.userName;
    if (patch.validationResult !== undefined)
      set.validationResult = patch.validationResult;
    if (patch.eventId !== undefined) set.eventId = patch.eventId;
    if (Object.keys(set).length === 0) return;
    await this.db.update(tanzaku).set(set).where(eq(tanzaku.id, id));
  }
}
