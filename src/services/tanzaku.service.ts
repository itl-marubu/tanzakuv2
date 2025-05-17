import { PrismaD1 } from "@prisma/adapter-d1";
import { PrismaClient } from "../generated/prisma";

export class TanzakuService {
  private prisma: PrismaClient;

  constructor(db: D1Database) {
    const adapter = new PrismaD1(db);
    this.prisma = new PrismaClient({ adapter });
  }

  async createTanzaku(data: { content: string; userName: string }) {
    return await this.prisma.tanzaku.create({
      data,
    });
  }

  async getTanzakuById(id: string) {
    return await this.prisma.tanzaku.findUnique({
      where: { id },
    });
  }

  async getTwentyTanzaku() {
    const result = await this.prisma.tanzaku.findMany({
      take: 10,
      orderBy: {
        createdAt: "desc",
      },
      where: {
        visiblePattern: true,
      },
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
