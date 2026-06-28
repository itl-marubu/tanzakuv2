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

const validateTanzaku = async (ai: Ai, text: string): Promise<number> => {
  // Llama 4 系は response_format ではなく guided_json で構造化出力を指定する。
  const raw = await ai.run(MODERATION_MODEL, {
    prompt: `あなたは校閲のプロフェッショナルです。ユーザーは七夕の短冊プロジェクトにいくつかのメッセージを投稿しています。それらのメッセージを校閲して、明らかに不適切であれば1と、適切であれば0と返してください。\n適切かどうかの基準は、公序良俗に反したことを言っているかどうかです。\n例: {\n  user: "楽しい七夕です!",\n  result: 0\n},{\n  user: "爆発しそうなくらい楽しい",\n  result: 0\n},{\n  user: "A先生キショい",\n  result: 1\n},{\n  user: "蓮舫蓮舫蓮舫蓮舫",\n  result: 1\n},{\n  user: "大学の自治を守ろう",\n  result: 0\n},{\n  user: "美味しいカレーが食べたい",\n  result: 0\n},{\n  user: "中央大学を爆破する",\n  result: 1\n},\nメッセージ: ${text}`,
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

  // Scout は { response: "<JSON文字列>" } を返す。モデルによっては response が
  // オブジェクトのこともあるため、文字列・オブジェクトの両方を許容して解釈する。
  const responseField =
    typeof raw === "object" && raw !== null && "response" in raw
      ? (raw as { response: unknown }).response
      : raw;

  let parsed: unknown = responseField;
  if (typeof responseField === "string") {
    try {
      parsed = JSON.parse(responseField);
    } catch (error) {
      console.error("JSON Parse Error:", error, responseField);
      throw new Error("Failed to parse AI response");
    }
  }

  if (
    !parsed ||
    typeof parsed !== "object" ||
    !("result" in parsed) ||
    typeof (parsed as { result: unknown }).result !== "number"
  ) {
    console.error("Invalid AI Response:", raw);
    throw new Error("Invalid response from AI");
  }

  const value = (parsed as { result: number }).result;
  if (value !== VALIDATION_OK && value !== VALIDATION_NG) {
    console.error("Invalid Validation Result:", parsed);
    throw new Error("Invalid validation result");
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

    let validationResult = 0; // デフォルトは適切
    if (ai) {
      validationResult = await validateTanzaku(
        ai,
        `${data.content}${data.userName}`
      );
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
