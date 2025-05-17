import { PrismaD1 } from "@prisma/adapter-d1";
import { PrismaClient } from "../generated/prisma";

interface AIResponse {
  response: {
    result: number;
  };
}

const validateTanzaku = async (ai: Ai, text: string) => {
  const result = (await ai.run("@cf/meta/llama-3.3-70b-instruct-fp8-fast", {
    prompt: `あなたは校閲のプロフェッショナルです。ユーザーは七夕の短冊プロジェクトにいくつかのメッセージを投稿しています。それらのメッセージを校閲して、明らかに不適切であれば1と、適切であれば0と返してください。\n適切かどうかの基準は、公序良俗に反したことを言っているかどうかです。\n例: {\n  user: "楽しい七夕です!",\n  result: 0\n},{\n  user: "爆発しそうなくらい楽しい",\n  result: 0\n},{\n  user: "A先生キショい",\n  result: 1\n},{\n  user: "蓮舫蓮舫蓮舫蓮舫",\n  result: 1\n},{\n  user: "大学の自治を守ろう",\n  result: 0\n},{\n  user: "美味しいカレーが食べたい",\n  result: 0\n},{\n  user: "中央大学を爆破する",\n  result: 1\n},\nメッセージ: ${text}`,
    response_format: {
      type: "json_schema",
      json_schema: {
        type: "object",
        properties: {
          result: {
            type: "number",
            enum: [0, 1],
          },
        },
      },
    },
  })) as unknown as AIResponse;

  if (
    !result ||
    typeof result !== "object" ||
    !("response" in result) ||
    typeof result.response !== "object" ||
    !("result" in result.response) ||
    typeof result.response.result !== "number"
  ) {
    console.error("Invalid AI Response:", result);
    throw new Error("Invalid response from AI");
  }

  try {
    const parsedResponse = result.response;

    if (![0, 1].includes(parsedResponse.result)) {
      console.error("Invalid Validation Result:", parsedResponse);
      throw new Error("Invalid validation result");
    }

    return parsedResponse.result;
  } catch (error) {
    console.error("JSON Parse Error:", error);
    throw new Error("Failed to parse AI response");
  }
};

export class TanzakuService {
  private prisma: PrismaClient;

  constructor(db: D1Database) {
    const adapter = new PrismaD1(db);
    this.prisma = new PrismaClient({ adapter });
  }

  async createTanzaku(data: { content: string; userName: string }, ai: Ai) {
    if (data.content.length > 14) {
      throw new Error("メッセージは14文字以内で入力してください");
    }
    const validationResult = await validateTanzaku(
      ai,
      `${data.content}${data.userName}`
    );

    return await this.prisma.tanzaku.create({
      data: {
        ...data,
        validationResult,
      },
    });
  }

  async getTanzakuById(id: string) {
    return await this.prisma.tanzaku.findUnique({
      where: { id },
    });
  }

  async getTwentyTanzaku() {
    const checkexistance = await this.prisma.tanzaku.findMany({
      take: 1,
      where: {
        visiblePattern: true,
      },
    });
    if (checkexistance.length === 0) {
      await this.prisma.tanzaku.updateMany({
        where: {
          visiblePattern: false,
        },
        data: { visiblePattern: true },
      });
    }

    const result = await this.prisma.tanzaku.findMany({
      take: 20,
      orderBy: {
        createdAt: "desc",
      },
      where: {
        visiblePattern: true,
      },
    });

    if (result.length === 0) {
      throw new Error("Tanzaku not found");
    }

    await this.prisma.tanzaku.updateMany({
      where: {
        id: { in: result.map((r) => r.id) },
      },
      data: { visiblePattern: false },
    });

    return result;
  }

  async getAllTanzaku() {
    return await this.prisma.tanzaku.findMany({
      orderBy: {
        createdAt: "desc",
      },
    });
  }

  async editTanzaku(
    data: {
      id: string;
      operation: "delete" | "update";
      content?: string;
      userName?: string;
    }[]
  ) {
    if (data.some((d) => d.operation === "delete")) {
      await this.prisma.tanzaku.deleteMany({
        where: {
          id: { in: data.map((d) => d.id) },
        },
      });
    } else {
      await Promise.all(
        data.map((d) =>
          this.prisma.tanzaku.update({
            where: { id: d.id },
            data: {
              content: d.content ?? undefined,
              userName: d.userName ?? undefined,
            },
          })
        )
      );
    }
  }
}
