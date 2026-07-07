import { createDb } from "../db/client";
import type { TanzakuRow } from "../db/schema";
import { nowForDb, toApiDate } from "../lib/dates";
import { newUuid } from "../lib/id";
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
   * ウォール表示用のローテーション取得。
   * アクティブイベント(なければレガシー)スコープで、
   * 表示可能な短冊が尽きていたら visiblePattern をリセットしてから
   * createdAt 降順で limit 件返し、返した行は非表示にマークする。
   */
  async getClientTanzaku(limit = 10) {
    const safeLimit = Math.min(30, Math.max(1, Math.floor(limit)));
    const activeEvent = await this.events.findActive();
    const scopeEventId = activeEvent?.id ?? null;

    if (!(await this.tanzakus.existsDisplayable(scopeEventId))) {
      await this.tanzakus.resetVisibility(scopeEventId);
    }

    const result = await this.tanzakus.findDisplayable(safeLimit, scopeEventId);
    if (result.length === 0) {
      return [];
    }

    await this.tanzakus.markHidden(result.map((r) => r.id));

    return result.map(serialize);
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
