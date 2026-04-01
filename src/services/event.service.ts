import { PrismaD1 } from "@prisma/adapter-d1";
import { PrismaClient } from "../generated/prisma";

export class EventService {
  private prisma: PrismaClient;

  constructor(db: D1Database) {
    const adapter = new PrismaD1(db);
    this.prisma = new PrismaClient({ adapter });
  }

  async createEvent(data: { id?: string; name: string; description?: string }) {
    return await this.prisma.event.create({ data });
  }

  async getAllEvents() {
    return await this.prisma.event.findMany({
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { tanzakus: true } } }
    });
  }

  async getActiveEvent() {
    return await this.prisma.event.findFirst({
      where: { isActive: true }
    });
  }

  async activateEvent(id: string) {
    const event = await this.prisma.event.findUnique({ where: { id } });
    if (!event) {
      throw new Error(`Event not found: ${id}`);
    }
    const [, activated] = await this.prisma.$transaction([
      this.prisma.event.updateMany({ data: { isActive: false } }),
      this.prisma.event.update({ where: { id }, data: { isActive: true } })
    ]);
    return activated;
  }

  async deactivateAll() {
    return await this.prisma.event.updateMany({ data: { isActive: false } });
  }
}
