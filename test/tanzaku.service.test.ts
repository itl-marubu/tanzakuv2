import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { createDb } from "../src/db/client";
import { event, tanzaku } from "../src/db/schema";
import { nowForDb } from "../src/lib/dates";
import {
  FRESH_WINDOW_MS,
  hashSeed,
  rotationOffset,
  splitWindow,
  windowIndexFromClock
} from "../src/lib/rotation";
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

describe("getClientTanzaku(ステートレス・ローテーション)", () => {
  // 固定の基準時刻(now を明示注入してテストを決定的にする)
  const NOW = new Date("2025-06-23T10:05:00.000Z");
  const iso = (offsetMs: number) =>
    new Date(NOW.getTime() + offsetMs).toISOString();

  // 新着窓(直近60秒)の外側(=巡回プール対象) / 内側(=新着対象)の基準オフセット
  const OLD = -70_000;
  const FRESH = -1_000;

  it("同一 limit/window/seed の呼び出しは常に同一結果を返す(GETに副作用なし)", async () => {
    for (let i = 0; i < 5; i++) {
      await seedTanzaku(`tz-${i}`, { createdAt: iso(OLD - i * 1000) });
    }
    const call = () =>
      service().getClientTanzaku({
        limit: 3,
        window: 4,
        seed: "repeat",
        now: NOW
      });

    const first = (await call()).map((t) => t.id);
    const second = (await call()).map((t) => t.id);
    const third = (await call()).map((t) => t.id);

    expect(second).toEqual(first);
    expect(third).toEqual(first);
  });

  it("window+1 で巡回セグメントが入れ替わり、一周後(同じ位相)は同一結果に戻る(ラップ)", async () => {
    // 巡回プール6件(古い順 tz-0 < tz-1 < ... < tz-5)。
    // limit=2・全件旧データ(新着なし)なので remaining=2=slotsPerWindow。
    // poolCount(6) は slotsPerWindow(2) の倍数なので window+3 で位相が一致する。
    for (let i = 0; i < 6; i++) {
      await seedTanzaku(`tz-${i}`, { createdAt: iso(OLD + i * 1000) });
    }
    const at = (window: number) =>
      service()
        .getClientTanzaku({ limit: 2, window, seed: "wrap-seed", now: NOW })
        .then((rows) => rows.map((t) => t.id));

    const w0 = await at(0);
    const w1 = await at(1);
    const w3 = await at(3);

    expect(w1).not.toEqual(w0);
    expect(w3).toEqual(w0);
  });

  it("seed を変えると同一 window でも巡回セグメントが入れ替わる", async () => {
    for (let i = 0; i < 6; i++) {
      await seedTanzaku(`tz-${i}`, { createdAt: iso(OLD + i * 1000) });
    }
    const withSeed = (seed: string) =>
      service()
        .getClientTanzaku({ limit: 2, window: 0, seed, now: NOW })
        .then((rows) => rows.map((t) => t.id));

    // hashSeed("seed-a") % 6 !== hashSeed("seed-b") % 6 であることを確認済み
    const a = await withSeed("seed-a");
    const b = await withSeed("seed-b");
    expect(a).not.toEqual(b);
  });

  it("新着(直近60秒)は window/seed によらず必ず先頭に出る", async () => {
    await seedTanzaku("tz-fresh", { createdAt: iso(FRESH) });
    for (let i = 0; i < 3; i++) {
      await seedTanzaku(`tz-pool-${i}`, { createdAt: iso(OLD + i * 1000) });
    }

    const a = await service().getClientTanzaku({
      limit: 5,
      window: 0,
      seed: "x",
      now: NOW
    });
    const b = await service().getClientTanzaku({
      limit: 5,
      window: 99,
      seed: "y",
      now: NOW
    });

    expect(a[0]?.id).toBe("tz-fresh");
    expect(b[0]?.id).toBe("tz-fresh");
  });

  it("新着は limit-2 件を超えると createdAt 新しい順にトリミングされ、溢れは巡回待ちになる", async () => {
    // limit=5 → 新着枠は3。新着5件のうち新しい3件のみ新着セグメントに採用される
    for (let i = 0; i < 5; i++) {
      // i が大きいほど新しい
      await seedTanzaku(`tz-fresh-${i}`, { createdAt: iso(FRESH + i * 100) });
    }
    await seedTanzaku("tz-pool-a", { createdAt: iso(OLD) });
    await seedTanzaku("tz-pool-b", { createdAt: iso(OLD - 1000) });

    const result = await service().getClientTanzaku({
      limit: 5,
      window: 0,
      seed: "",
      now: NOW
    });

    expect(result).toHaveLength(5);
    expect(result.slice(0, 3).map((t) => t.id)).toEqual([
      "tz-fresh-4",
      "tz-fresh-3",
      "tz-fresh-2"
    ]);
    // 溢れた新着2件(tz-fresh-0/1)は新着として採用されず、
    // 巡回プール(tz-pool-a/b と合わせた計4件)へ回って重複なく残り2枠を埋める
    const overflowed = result.slice(3).map((t) => t.id);
    const poolCandidates = new Set([
      "tz-pool-a",
      "tz-pool-b",
      "tz-fresh-0",
      "tz-fresh-1"
    ]);
    for (const id of overflowed) {
      expect(poolCandidates.has(id)).toBe(true);
    }
    expect(new Set(overflowed).size).toBe(2);
  });

  it("プールが残り枠数より少なければ全件・重複なしで返す", async () => {
    await seedTanzaku("tz-p1", { createdAt: iso(OLD) });
    await seedTanzaku("tz-p2", { createdAt: iso(OLD - 1000) });

    // 新着なし・プール2件のみ。limit=10 → remaining=8 > poolCount=2
    const result = await service().getClientTanzaku({
      limit: 10,
      window: 5,
      seed: "s",
      now: NOW
    });

    const ids = result.map((t) => t.id);
    expect([...ids].sort()).toEqual(["tz-p1", "tz-p2"]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("limit<=2 のときは新着枠が0になり、直近の投稿も巡回セグメント扱いになる", async () => {
    await seedTanzaku("tz-a", { createdAt: iso(OLD) });
    await seedTanzaku("tz-b", { createdAt: iso(OLD + 1000) });
    await seedTanzaku("tz-newest", { createdAt: iso(FRESH) });

    // limit=10 なら新着枠があるので tz-newest が新着セグメントの先頭に来る
    const withFreshSlot = await service().getClientTanzaku({
      limit: 10,
      window: 0,
      seed: "",
      now: NOW
    });
    expect(withFreshSlot[0]?.id).toBe("tz-newest");

    // limit=2 なら新着枠は0。tz-newest も巡回プールに含まれ、
    // ASC 順プール(tz-a, tz-b, tz-newest)上の rotationOffset/splitWindow が
    // 決める位置のものだけが返る(新着として先頭固定はされない)
    const ascIds = ["tz-a", "tz-b", "tz-newest"];
    const poolCount = ascIds.length;
    const remaining = 2;
    const offset = rotationOffset(0, hashSeed(""), remaining, poolCount);
    const expectedIds = splitWindow(offset, remaining, poolCount).flatMap(
      (part) =>
        Array.from({ length: part.limit }, (_, i) => ascIds[part.offset + i])
    );

    const noFreshSlot = await service().getClientTanzaku({
      limit: 2,
      window: 0,
      seed: "",
      now: NOW
    });
    expect(noFreshSlot.map((t) => t.id)).toEqual(expectedIds);
  });

  it("window/seed 未指定時はサーバー壁時計から window を導出する", async () => {
    for (let i = 0; i < 6; i++) {
      await seedTanzaku(`tz-${i}`, { createdAt: iso(OLD + i * 1000) });
    }
    // ちょうど FRESH_WINDOW_MS(60秒)分ずらすと windowIndexFromClock が+1される
    const laterNow = new Date(NOW.getTime() + FRESH_WINDOW_MS);

    const implicit0 = await service().getClientTanzaku({
      limit: 2,
      seed: "clock",
      now: NOW
    });
    const implicit1 = await service().getClientTanzaku({
      limit: 2,
      seed: "clock",
      now: laterNow
    });
    const explicit0 = await service().getClientTanzaku({
      limit: 2,
      window: windowIndexFromClock(NOW),
      seed: "clock",
      now: NOW
    });
    const explicit1 = await service().getClientTanzaku({
      limit: 2,
      window: windowIndexFromClock(laterNow),
      seed: "clock",
      now: laterNow
    });

    expect(implicit0.map((t) => t.id)).toEqual(explicit0.map((t) => t.id));
    expect(implicit1.map((t) => t.id)).toEqual(explicit1.map((t) => t.id));
  });

  it("不適切(1)・論理削除済みはローテーションに含めない", async () => {
    await seedTanzaku("tz-ok", { createdAt: iso(OLD) });
    await seedTanzaku("tz-ng", { createdAt: iso(OLD), validationResult: 1 });
    await seedTanzaku("tz-del", { createdAt: iso(OLD), logicalDelete: true });

    const result = await service().getClientTanzaku({ limit: 10, now: NOW });
    expect(result.map((t) => t.id)).toEqual(["tz-ok"]);
  });

  it("アクティブイベントがあればそのスコープのみ返す", async () => {
    await seedEvent("ev-active", true);
    await seedEvent("ev-other", false);
    await seedTanzaku("tz-active", {
      eventId: "ev-active",
      createdAt: iso(OLD)
    });
    await seedTanzaku("tz-other", {
      eventId: "ev-other",
      createdAt: iso(OLD)
    });
    await seedTanzaku("tz-legacy", { eventId: null, createdAt: iso(OLD) });

    const result = await service().getClientTanzaku({ limit: 10, now: NOW });
    expect(result.map((t) => t.id)).toEqual(["tz-active"]);
  });

  it("アクティブイベントがなければレガシー(eventId=null)のみ返す", async () => {
    await seedEvent("ev-inactive", false);
    await seedTanzaku("tz-event", {
      eventId: "ev-inactive",
      createdAt: iso(OLD)
    });
    await seedTanzaku("tz-legacy", { eventId: null, createdAt: iso(OLD) });

    const result = await service().getClientTanzaku({ limit: 10, now: NOW });
    expect(result.map((t) => t.id)).toEqual(["tz-legacy"]);
  });

  it("limit は 1〜30 に clamp される", async () => {
    for (let i = 0; i < 35; i++) {
      await seedTanzaku(`tz-${String(i).padStart(2, "0")}`, {
        createdAt: iso(OLD - i * 1000)
      });
    }
    const result = await service().getClientTanzaku({ limit: 100, now: NOW });
    expect(result.length).toBe(30);
  });

  it("対象が1件もなければ空配列", async () => {
    expect(await service().getClientTanzaku({ now: NOW })).toEqual([]);
  });

  describe("createdAt混在形式(旧SQLite形式 + ISO 8601)", () => {
    // 旧SQLite形式("YYYY-MM-DD HH:MM:SS")の createdAt を生成するヘルパー。
    // lib/dates.ts の SQLITE_DATETIME_RE にマッチする形式(区切り文字が ' ')にする。
    const legacy = (offsetMs: number) =>
      new Date(NOW.getTime() + offsetMs)
        .toISOString()
        .slice(0, 19)
        .replace("T", " ");

    it("旧形式(過去日付)は新着セグメントに誤って入らず、ISO形式の直近行は正しく入る", async () => {
      // findFresh は gte(createdAt, sinceISO) というテキスト比較で判定している。
      // "YYYY-MM-DD HH:MM:SS"(区切りが ' '=0x20)は "YYYY-MM-DDTHH:MM:SS.sssZ"
      // (区切りが 'T'=0x54)より文字列として常に小さいため、旧形式の行は
      // 実際の日時に関わらず gte 条件を満たさない=新着セグメントには構造的に
      // 入り得ない(過去日付であれば安全側に倒れる、という性質を明示的に検証する)。
      await seedTanzaku("tz-legacy-old", { createdAt: legacy(OLD) });
      // ISO形式の直近行は通常通り新着セグメントの先頭に来る
      await seedTanzaku("tz-iso-fresh", { createdAt: iso(FRESH) });

      const result = await service().getClientTanzaku({
        limit: 10,
        window: 0,
        seed: "mixed-fresh",
        now: NOW
      });
      const ids = result.map((t) => t.id);

      expect(ids[0]).toBe("tz-iso-fresh");
      // 旧形式行も消えるわけではなく、巡回セグメント側で全件性は保たれる
      expect(ids).toContain("tz-legacy-old");
      expect(ids.indexOf("tz-legacy-old")).toBeGreaterThan(0);
    });

    it("巡回セグメントは旧形式/ISO混在プールでも重複なく全件をカバーする", async () => {
      // プール6件(旧形式3件 + ISO形式3件、いずれも新着window外の過去日付)。
      // createdAt ASC はテキスト比較のため、旧形式('区切り)とISO形式('T'区切り)が
      // 混在すると実際の時系列順とは異なる並びになり得る(旧形式は常にISO形式より
      // 文字列として小さいため、実際の新旧に関係なく旧形式が先に並ぶ)。
      // これは仕様として許容する: 巡回ローテーションに必要なのは「同一window/seedで
      // 決定的」「複数窓の合算で重複なく全件が出現する」ことであり、厳密な時系列順
      // ではない(消費型だった旧実装も厳密な時系列順は保証していなかった点と同等)。
      const legacyIds = ["tz-legacy-0", "tz-legacy-1", "tz-legacy-2"];
      const isoIds = ["tz-iso-0", "tz-iso-1", "tz-iso-2"];
      for (const [i, id] of legacyIds.entries()) {
        await seedTanzaku(id, { createdAt: legacy(OLD - i * 1000) });
      }
      for (const [i, id] of isoIds.entries()) {
        await seedTanzaku(id, { createdAt: iso(OLD - (i + 10) * 1000) });
      }
      const allIds = new Set([...legacyIds, ...isoIds]);

      const at = (window: number) =>
        service()
          .getClientTanzaku({
            limit: 2,
            window,
            seed: "mixed-coverage",
            now: NOW
          })
          .then((rows) => rows.map((t) => t.id));

      // 決定性: 同一 window/seed の呼び出しは常に同一結果
      const w0First = await at(0);
      const w0Second = await at(0);
      expect(w0Second).toEqual(w0First);

      // 全件性: poolCount(6) は slotsPerWindow(2=remaining) の倍数なので、
      // window 0〜2 の3窓の合算でちょうど全件・重複なしをカバーする
      const covered = [...(await at(0)), ...(await at(1)), ...(await at(2))];
      expect(new Set(covered)).toEqual(allIds);
      expect(covered.length).toBe(allIds.size);
    });
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
