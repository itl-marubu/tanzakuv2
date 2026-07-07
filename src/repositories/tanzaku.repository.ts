import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  notInArray
} from "drizzle-orm";
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

// ウォールに表示可能な短冊: 適切判定・未削除(かつイベントスコープ内)
const displayable = (eventId: string | null) =>
  and(
    eq(tanzaku.validationResult, 0),
    eq(tanzaku.logicalDelete, false),
    eventScope(eventId)
  );

// excludeIds は新着セグメントで既に採用した id(たかだか limit-2 ≦ 28 件)を
// 巡回セグメントから除外するためのもの。notInArray で十分なサイズに収まる。
const rotationPoolScope = (eventId: string | null, excludeIds: string[]) =>
  excludeIds.length > 0
    ? and(displayable(eventId), notInArray(tanzaku.id, excludeIds))
    : displayable(eventId);

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

  /**
   * 新着セグメント: sinceDb(DB格納形式の時刻文字列)以降に作成された表示可能な
   * 短冊を新しい順(createdAt DESC, id DESC タイブレーク)に最大 max 件返す。
   */
  async findFresh(
    eventId: string | null,
    sinceDb: string,
    max: number
  ): Promise<TanzakuRow[]> {
    if (max <= 0) return [];
    return this.db
      .select()
      .from(tanzaku)
      .where(and(displayable(eventId), gte(tanzaku.createdAt, sinceDb)))
      .orderBy(desc(tanzaku.createdAt), desc(tanzaku.id))
      .limit(max);
  }

  /** 巡回セグメントの母集団(新着で採用済みの excludeIds を除く)の件数 */
  async countRotationPool(
    eventId: string | null,
    excludeIds: string[]
  ): Promise<number> {
    const rows = await this.db
      .select({ value: count() })
      .from(tanzaku)
      .where(rotationPoolScope(eventId, excludeIds));
    return rows[0]?.value ?? 0;
  }

  /**
   * 巡回セグメント: 安定順序(createdAt ASC, id ASC タイブレーク)上の
   * [offset, offset+limit) を切り出す。ラップ跨ぎは呼び出し側で
   * lib/rotation.ts の splitWindow により2回に分けて呼ぶ想定。
   */
  async findRotationSlice(
    eventId: string | null,
    excludeIds: string[],
    offset: number,
    limit: number
  ): Promise<TanzakuRow[]> {
    if (limit <= 0) return [];
    return this.db
      .select()
      .from(tanzaku)
      .where(rotationPoolScope(eventId, excludeIds))
      .orderBy(asc(tanzaku.createdAt), asc(tanzaku.id))
      .limit(limit)
      .offset(offset);
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
