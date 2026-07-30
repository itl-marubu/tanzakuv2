import { createDb } from "../db/client";
import type { TanzakuRow } from "../db/schema";
import { dateForDb, nowForDb, toApiDate } from "../lib/dates";
import { newUuid } from "../lib/id";
import {
  FRESH_RESERVED_SLOTS,
  FRESH_WINDOW_MS,
  hashSeed,
  rotationOffset,
  splitWindow,
  windowIndexFromClock
} from "../lib/rotation";
import { EventRepository } from "../repositories/event.repository";
import {
  TanzakuRepository,
  type TanzakuWithEvent
} from "../repositories/tanzaku.repository";
import {
  type ModerationAi,
  VALIDATION_NG,
  VALIDATION_OK,
  validateTanzaku
} from "./moderation.service";

// API レスポンス形(旧 Prisma + c.json と同一): createdAt は ISO 8601(Z)
const serialize = <T extends TanzakuRow>(row: T) => ({
  ...row,
  createdAt: toApiDate(row.createdAt)
});

export type TanzakuEditOperation =
  | { id: string; operation: "delete" }
  | { id: string; operation: "hardDelete" }
  | {
      id: string;
      operation: "update";
      content?: string;
      userName?: string;
      validationResult?: number;
      eventId?: string | null;
    };

export class TanzakuService {
  private readonly tanzakus: TanzakuRepository;
  private readonly events: EventRepository;

  constructor(db: D1Database) {
    const client = createDb(db);
    this.tanzakus = new TanzakuRepository(client);
    this.events = new EventRepository(client);
  }

  async createTanzaku(
    data: { content: string; userName: string },
    ai: ModerationAi | null = null
  ) {
    if (data.content.length > 14) {
      throw new Error("メッセージは14文字以内で入力してください");
    }

    let validationResult = VALIDATION_OK; // デフォルトは適切
    if (ai) {
      try {
        validationResult = await validateTanzaku(
          ai,
          `${data.content}${data.userName}`
        );
      } catch (error) {
        // 検証が失敗しても投稿自体は通す(500 で止めない)。ただし安全側に倒し、
        // 未検証のコンテンツがウォールに出ないよう非表示(1)で保存する。
        // 正当な投稿が巻き込まれた場合は管理画面で表示(0)に直せる。
        console.error(
          "Validation failed; saving tanzaku as hidden (1):",
          error
        );
        validationResult = VALIDATION_NG;
      }
    }

    // 投稿はアクティブイベントに紐付く。なければレガシー(null)
    const activeEvent = await this.events.findActive();

    const created = await this.tanzakus.insert({
      id: newUuid(),
      content: data.content,
      userName: data.userName,
      validationResult,
      createdAt: nowForDb(),
      eventId: activeEvent?.id ?? null
    });
    return serialize(created);
  }

  async getTanzakuById(id: string) {
    const row = await this.tanzakus.findById(id);
    return row ? serialize(row) : null;
  }

  /**
   * ウォール表示用のステートレス・ローテーション取得(DB書き込みゼロ)。
   *
   * - 新着セグメント: 直近60秒(FRESH_WINDOW_MS)以内に作成された表示可能な短冊を
   *   新しい順に最大 `limit - FRESH_RESERVED_SLOTS` 件。window/seed に非依存
   *   (サーバー時刻 `now` 基準)なので、リロード連打でも同じ新着が先頭に出る。
   *   ただし60秒以内の投稿がこの枠を超えた場合、溢れた分(古い方)は新着として
   *   採用されず巡回セグメントの母集団へ回る。「投稿直後は必ず出る」ではなく
   *   「直近 `limit - FRESH_RESERVED_SLOTS` 件に入っていれば出る」が正しい保証
   * - 巡回セグメント: 残り枠を、新着以外の表示可能な短冊の安定順序リスト
   *   (createdAt ASC, id ASC)上の窓で充填する。窓の位置は
   *   `offset = (window × 残り枠数 + fnv1a(seed)) mod poolCount` で決定的に求め、
   *   末尾に達したら先頭へラップ(2回に分けて取得)する
   * - window/seed が指定されなければサーバー壁時計から window を導出する
   *   (カーソル未対応の旧フロント互換のデフォルト)
   *
   * `now` はテスト用の注入ポイント(省略時は呼び出し時刻)。
   */
  async getClientTanzaku(
    params: {
      limit?: number;
      window?: number;
      seed?: string;
      now?: Date;
    } = {}
  ) {
    const safeLimit = Math.min(30, Math.max(1, Math.floor(params.limit ?? 10)));
    const now = params.now ?? new Date();

    const activeEvent = await this.events.findActive();
    const scopeEventId = activeEvent?.id ?? null;

    const freshMax = Math.max(0, safeLimit - FRESH_RESERVED_SLOTS);
    const sinceDb =
      freshMax > 0
        ? dateForDb(new Date(now.getTime() - FRESH_WINDOW_MS))
        : null;
    const fresh =
      freshMax > 0 && sinceDb !== null
        ? await this.tanzakus.findFresh(scopeEventId, sinceDb, freshMax)
        : [];

    const remaining = safeLimit - fresh.length;
    if (remaining <= 0) {
      return fresh.map(serialize);
    }

    const excludeIds = fresh.map((r) => r.id);
    const poolCount = await this.tanzakus.countRotationPool(
      scopeEventId,
      excludeIds
    );
    if (poolCount === 0) {
      return fresh.map(serialize);
    }

    const windowIndex = params.window ?? windowIndexFromClock(now);
    const seedHash = hashSeed(params.seed ?? "");
    const offset = rotationOffset(windowIndex, seedHash, remaining, poolCount);

    const poolRows: TanzakuRow[] = [];
    for (const part of splitWindow(offset, remaining, poolCount)) {
      const rows = await this.tanzakus.findRotationSlice(
        scopeEventId,
        excludeIds,
        part.offset,
        part.limit
      );
      poolRows.push(...rows);
    }

    return [...fresh, ...poolRows].map(serialize);
  }

  async getAllTanzaku() {
    const rows = await this.tanzakus.findAllWithEvent();
    return rows.map((row: TanzakuWithEvent) => serialize(row));
  }

  async editTanzaku(data: TanzakuEditOperation[]) {
    const deleteIds = data
      .filter((d) => d.operation === "delete")
      .map((d) => d.id);
    const hardDeleteIds = data
      .filter((d) => d.operation === "hardDelete")
      .map((d) => d.id);
    const updates = data.filter((d) => d.operation === "update");

    await this.tanzakus.markLogicalDeleted(deleteIds);
    await this.tanzakus.hardDelete(hardDeleteIds);

    await Promise.all(
      updates.map((d) =>
        this.tanzakus.updateOne(d.id, {
          content: d.content,
          userName: d.userName,
          validationResult: d.validationResult,
          eventId: d.eventId
        })
      )
    );
  }
}
