import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { createDb } from "../src/db/client";
import { event, tanzaku } from "../src/db/schema";
import { nowForDb } from "../src/lib/dates";
import type { ModerationAi } from "../src/services/moderation.service";
import { TanzakuService } from "../src/services/tanzaku.service";

const db = createDb(env.DB);
const service = () => new TanzakuService(env.DB);

const seedEvent = async (id: string, isActive: boolean) => {
  await db.insert(event).values({
    id,
    name: `イベント${id}`,
    isActive,
    createdAt: nowForDb()
  });
};

const seedTanzaku = async (
  id: string,
  overrides: Partial<typeof tanzaku.$inferInsert> = {}
) => {
  await db.insert(tanzaku).values({
    id,
    content: `内容${id}`,
    userName: `名前${id}`,
    createdAt: nowForDb(),
    ...overrides
  });
};

const aiReturning = (raw: unknown): ModerationAi => ({ run: async () => raw });
const aiThrowing = (): ModerationAi => ({
  run: async () => {
    throw new Error("AI unavailable");
  }
});

describe("createTanzaku", () => {
  it("AI なしでは validationResult=0・レガシー(eventId=null)で保存する", async () => {
    const created = await service().createTanzaku({
      content: "テスト",
      userName: "太郎"
    });
    expect(created.content).toBe("テスト");
    expect(created.userName).toBe("太郎");
    expect(created.validationResult).toBe(0);
    expect(created.visiblePattern).toBe(true);
    expect(created.logicalDelete).toBe(false);
    expect(created.eventId).toBeNull();
    // API 互換: createdAt は ISO 8601(Z)
    expect(created.createdAt).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
    );
  });

  it("アクティブイベントがあればそこに紐付ける", async () => {
    await seedEvent("ev-1", true);
    const created = await service().createTanzaku({
      content: "テスト",
      userName: "太郎"
    });
    expect(created.eventId).toBe("ev-1");
  });

  it("AI が不適切(1)と判定したら validationResult=1 で保存する", async () => {
    const created = await service().createTanzaku(
      { content: "不適切な内容", userName: "太郎" },
      aiReturning({ result: 1 })
    );
    expect(created.validationResult).toBe(1);
  });

  it("AI へは content+userName の連結を渡す", async () => {
    let captured: string | undefined;
    const ai: ModerationAi = {
      run: async (_model, options) => {
        captured = options.messages.find((m) => m.role === "user")?.content;
        return { result: 0 };
      }
    };
    await service().createTanzaku({ content: "願い", userName: "太郎" }, ai);
    expect(captured).toBe("願い太郎");
  });

  it("AI 検証が失敗しても保存は通し、安全側(1=非表示)に倒す", async () => {
    const created = await service().createTanzaku(
      { content: "テスト", userName: "太郎" },
      aiThrowing()
    );
    expect(created.validationResult).toBe(1);
  });

  it("14文字を超える content は throw する", async () => {
    await expect(
      service().createTanzaku({
        content: "あいうえおかきくけこさしすせそ",
        userName: "太郎"
      })
    ).rejects.toThrow("メッセージは14文字以内で入力してください");
  });
});

describe("getTanzakuById", () => {
  it("存在すれば返し、なければ null", async () => {
    await seedTanzaku("tz-1");
    const found = await service().getTanzakuById("tz-1");
    expect(found?.id).toBe("tz-1");
    expect(await service().getTanzakuById("missing")).toBeNull();
  });
});

describe("getClientTanzaku(ローテーション)", () => {
  it("createdAt 降順で limit 件返し、返した行を非表示にする", async () => {
    await seedTanzaku("tz-old", { createdAt: "2025-06-21T10:00:00.000Z" });
    await seedTanzaku("tz-mid", { createdAt: "2025-06-22T10:00:00.000Z" });
    await seedTanzaku("tz-new", { createdAt: "2025-06-23T10:00:00.000Z" });

    const first = await service().getClientTanzaku(2);
    expect(first.map((t) => t.id)).toEqual(["tz-new", "tz-mid"]);

    // 2回目: 残り1件のみ
    const second = await service().getClientTanzaku(2);
    expect(second.map((t) => t.id)).toEqual(["tz-old"]);

    // 3回目: 表示可能が尽きたのでリセットされ再び先頭から
    const third = await service().getClientTanzaku(2);
    expect(third.map((t) => t.id)).toEqual(["tz-new", "tz-mid"]);
  });

  it("不適切(1)・論理削除済みはローテーションに含めない", async () => {
    await seedTanzaku("tz-ok");
    await seedTanzaku("tz-ng", { validationResult: 1 });
    await seedTanzaku("tz-del", { logicalDelete: true });

    const result = await service().getClientTanzaku(10);
    expect(result.map((t) => t.id)).toEqual(["tz-ok"]);
  });

  it("アクティブイベントがあればそのスコープのみ返す", async () => {
    await seedEvent("ev-active", true);
    await seedEvent("ev-other", false);
    await seedTanzaku("tz-active", { eventId: "ev-active" });
    await seedTanzaku("tz-other", { eventId: "ev-other" });
    await seedTanzaku("tz-legacy", { eventId: null });

    const result = await service().getClientTanzaku(10);
    expect(result.map((t) => t.id)).toEqual(["tz-active"]);
  });

  it("アクティブイベントがなければレガシー(eventId=null)のみ返す", async () => {
    await seedEvent("ev-inactive", false);
    await seedTanzaku("tz-event", { eventId: "ev-inactive" });
    await seedTanzaku("tz-legacy", { eventId: null });

    const result = await service().getClientTanzaku(10);
    expect(result.map((t) => t.id)).toEqual(["tz-legacy"]);
  });

  it("limit は 1〜30 に clamp される", async () => {
    for (let i = 0; i < 35; i++) {
      await seedTanzaku(`tz-${String(i).padStart(2, "0")}`);
    }
    const result = await service().getClientTanzaku(100);
    expect(result.length).toBe(30);
  });

  it("対象が1件もなければ空配列", async () => {
    expect(await service().getClientTanzaku(10)).toEqual([]);
  });
});

describe("getAllTanzaku", () => {
  it("event {id,name} 付き・createdAt 降順で全件返す(削除済み含む)", async () => {
    await seedEvent("ev-1", true);
    await seedTanzaku("tz-a", {
      createdAt: "2025-06-21T10:00:00.000Z",
      eventId: "ev-1"
    });
    await seedTanzaku("tz-b", {
      createdAt: "2025-06-22T10:00:00.000Z",
      logicalDelete: true
    });

    const all = await service().getAllTanzaku();
    expect(all.map((t) => t.id)).toEqual(["tz-b", "tz-a"]);
    expect(all[0].event).toBeNull();
    expect(all[1].event).toEqual({ id: "ev-1", name: "イベントev-1" });
  });

  it("SQLite 形式の既存 createdAt も ISO に正規化して返す", async () => {
    await seedTanzaku("tz-legacy-date", {
      createdAt: "2025-06-21 10:00:00"
    });
    const all = await service().getAllTanzaku();
    expect(all[0].createdAt).toBe("2025-06-21T10:00:00.000Z");
  });
});

describe("editTanzaku", () => {
  beforeEach(async () => {
    await seedTanzaku("tz-1");
    await seedTanzaku("tz-2");
    await seedTanzaku("tz-3");
  });

  it("delete は論理削除する", async () => {
    await service().editTanzaku([{ id: "tz-1", operation: "delete" }]);
    const t = await service().getTanzakuById("tz-1");
    expect(t?.logicalDelete).toBe(true);
  });

  it("hardDelete は物理削除する", async () => {
    await service().editTanzaku([{ id: "tz-2", operation: "hardDelete" }]);
    expect(await service().getTanzakuById("tz-2")).toBeNull();
  });

  it("update は指定フィールドのみ更新する", async () => {
    await service().editTanzaku([
      {
        id: "tz-3",
        operation: "update",
        content: "更新済み",
        validationResult: 1
      }
    ]);
    const t = await service().getTanzakuById("tz-3");
    expect(t?.content).toBe("更新済み");
    expect(t?.userName).toBe("名前tz-3"); // 未指定は変更しない
    expect(t?.validationResult).toBe(1);
  });

  it("update で eventId に null を明示するとレガシーへ移動する", async () => {
    await seedEvent("ev-1", false);
    await service().editTanzaku([
      { id: "tz-1", operation: "update", eventId: "ev-1" }
    ]);
    expect((await service().getTanzakuById("tz-1"))?.eventId).toBe("ev-1");

    await service().editTanzaku([
      { id: "tz-1", operation: "update", eventId: null }
    ]);
    expect((await service().getTanzakuById("tz-1"))?.eventId).toBeNull();
  });

  it("複数操作を一括で適用する", async () => {
    await service().editTanzaku([
      { id: "tz-1", operation: "delete" },
      { id: "tz-2", operation: "hardDelete" },
      { id: "tz-3", operation: "update", userName: "花子" }
    ]);
    expect((await service().getTanzakuById("tz-1"))?.logicalDelete).toBe(true);
    expect(await service().getTanzakuById("tz-2")).toBeNull();
    expect((await service().getTanzakuById("tz-3"))?.userName).toBe("花子");
  });
});
