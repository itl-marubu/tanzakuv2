import { PrismaD1 } from "@prisma/adapter-d1";
import { PrismaClient } from "../generated/prisma";

// validationResult の値の取り決め:
//   0 = 適切（承認済み・ウォール表示）
//   1 = 不適切（NG・非表示）
const VALIDATION_OK = 0;
const VALIDATION_NG = 1;

// 検証モデル: Llama 4 Scout（MoE・ネイティブ多言語=日本語対応・131k context）。
// 旧 llama-3.3-70b は重く応答を支配していたため差し替え。コストも現行よりわずかに低い。
const MODERATION_MODEL = "@cf/meta/llama-4-scout-17b-16e-instruct";

// AI のレスポンス（文字列/オブジェクト混在・前後に余計な文章が付くことがある）から
// validationResult(0/1) を頑健に取り出す。取り出せなければ null。
const extractValidationResult = (raw: unknown): number | null => {
  const responseField =
    typeof raw === "object" && raw !== null && "response" in raw
      ? (raw as { response: unknown }).response
      : raw;

  // すでにオブジェクト（{ result: number }）で返る場合
  if (
    responseField &&
    typeof responseField === "object" &&
    typeof (responseField as { result?: unknown }).result === "number"
  ) {
    const v = (responseField as { result: number }).result;
    return v === VALIDATION_OK || v === VALIDATION_NG ? v : null;
  }

  if (typeof responseField !== "string") {
    return null;
  }

  // 1) 文字列全体が JSON
  try {
    const obj = JSON.parse(responseField) as { result?: unknown };
    if (obj && typeof obj.result === "number") {
      return obj.result === VALIDATION_OK || obj.result === VALIDATION_NG
        ? obj.result
        : null;
    }
  } catch {
    // フォールバックに進む
  }

  // 2) 文中に埋め込まれた "result": 0/1 を拾う（前後に説明文があっても可）。
  //    モデルが暴走して複数の result を羅列することがあるため、全件を集めて
  //    値が一意のときだけ採用する。0 と 1 が混在＝曖昧なら null を返して
  //    安全側（呼び出し元で非表示=1）に倒す。最初の一致を盲信しない。
  const matches = [...responseField.matchAll(/result["']?\s*[:=]\s*([01])/gi)];
  const distinct = new Set(matches.map((m) => Number(m[1])));
  if (distinct.size === 1) {
    return [...distinct][0];
  }

  // 一致なし、または 0/1 が混在して判別不能
  return null;
};

const validateTanzaku = async (ai: Ai, text: string): Promise<number> => {
  // prompt 形式だと few-shot 例文の「続き」を生成してしまい構造化出力が崩れるため、
  // チャット（messages）形式 + 厳格な system 指示で 1 件だけを判定させる。
  const raw = await ai.run(MODERATION_MODEL, {
    messages: [
      {
        role: "system",
        content:
          "あなたは七夕の短冊メッセージの校閲者です。与えられたメッセージ1件が、公序良俗に反して明らかに不適切なら 1、適切なら 0 と判定します。" +
          ' 出力は必ず {"result":0} または {"result":1} という JSON オブジェクトだけにし、理由や説明など他のテキストは一切含めないでください。\n' +
          '判定例:\n「楽しい七夕です!」→ {"result":0}\n「爆発しそうなくらい楽しい」→ {"result":0}\n' +
          '「A先生キショい」→ {"result":1}\n「蓮舫蓮舫蓮舫蓮舫」→ {"result":1}\n' +
          '「大学の自治を守ろう」→ {"result":0}\n「美味しいカレーが食べたい」→ {"result":0}\n' +
          '「中央大学を爆破する」→ {"result":1}'
      },
      { role: "user", content: text }
    ],
    guided_json: {
      type: "object",
      properties: {
        result: {
          type: "number",
          enum: [0, 1]
        }
      },
      required: ["result"]
    }
  });

  const value = extractValidationResult(raw);
  if (value === null) {
    console.error("Could not parse validation result from AI response:", raw);
    throw new Error("Failed to parse AI response");
  }
  return value;
};

export class TanzakuService {
  private prisma: PrismaClient;

  constructor(db: D1Database) {
    const adapter = new PrismaD1(db);
    this.prisma = new PrismaClient({ adapter });
  }

  async createTanzaku(
    data: { content: string; userName: string },
    ai: Ai | null = null
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
        // 検証が失敗しても投稿自体は通す（500 で止めない）。ただし安全側に倒し、
        // 未検証のコンテンツがウォールに出ないよう非表示(1)で保存する。
        // 正当な投稿が巻き込まれた場合は管理画面で表示(0)に直せる。
        console.error(
          "Validation failed; saving tanzaku as hidden (1):",
          error
        );
        validationResult = VALIDATION_NG;
      }
    }

    const activeEvent = await this.prisma.event.findFirst({
      where: { isActive: true }
    });

    return await this.prisma.tanzaku.create({
      data: {
        ...data,
        validationResult,
        eventId: activeEvent?.id ?? null
      }
    });
  }

  async getTanzakuById(id: string) {
    return await this.prisma.tanzaku.findUnique({
      where: { id }
    });
  }

  async getClientTanzaku(limit = 10) {
    const safeLimit = Math.min(30, Math.max(1, Math.floor(limit)));
    const activeEvent = await this.prisma.event.findFirst({
      where: { isActive: true }
    });
    const eventFilter = { eventId: activeEvent?.id ?? null };

    const checkexistance = await this.prisma.tanzaku.findMany({
      take: 1,
      where: {
        visiblePattern: true,
        validationResult: 0,
        logicalDelete: false,
        ...eventFilter
      }
    });
    if (checkexistance.length === 0) {
      await this.prisma.tanzaku.updateMany({
        where: {
          visiblePattern: false,
          ...eventFilter
        },
        data: { visiblePattern: true }
      });
    }

    const result = await this.prisma.tanzaku.findMany({
      take: safeLimit,
      orderBy: {
        createdAt: "desc"
      },
      where: {
        visiblePattern: true,
        validationResult: 0,
        logicalDelete: false,
        ...eventFilter
      }
    });

    if (result.length === 0) {
      return [];
    }

    await this.prisma.tanzaku.updateMany({
      where: {
        id: { in: result.map((r) => r.id) }
      },
      data: { visiblePattern: false }
    });

    return result;
  }

  async getAllTanzaku() {
    return await this.prisma.tanzaku.findMany({
      orderBy: {
        createdAt: "desc"
      },
      include: {
        event: { select: { id: true, name: true } }
      }
    });
  }

  async editTanzaku(
    data: {
      id: string;
      operation: "delete" | "hardDelete" | "update";
      content?: string;
      userName?: string;
      validationResult?: number;
      eventId?: string | null;
    }[]
  ) {
    const deleteData = data.filter((d) => d.operation === "delete");
    const hardDeleteData = data.filter((d) => d.operation === "hardDelete");
    const updateData = data.filter((d) => d.operation === "update");

    if (deleteData.length > 0) {
      await this.prisma.tanzaku.updateMany({
        where: {
          id: { in: deleteData.map((d) => d.id) }
        },
        data: {
          logicalDelete: true
        }
      });
    }

    if (hardDeleteData.length > 0) {
      await this.prisma.tanzaku.deleteMany({
        where: {
          id: { in: hardDeleteData.map((d) => d.id) }
        }
      });
    }

    if (updateData.length > 0) {
      await Promise.all(
        updateData.map((d) =>
          this.prisma.tanzaku.update({
            where: { id: d.id },
            data: {
              content: d.content ?? undefined,
              userName: d.userName ?? undefined,
              validationResult: d.validationResult ?? undefined,
              ...(d.eventId !== undefined ? { eventId: d.eventId } : {})
            }
          })
        )
      );
    }
  }
}
