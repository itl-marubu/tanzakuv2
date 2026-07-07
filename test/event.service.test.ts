import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { createDb } from "../src/db/client";
import { tanzaku } from "../src/db/schema";
import { nowForDb } from "../src/lib/dates";
import { EventService } from "../src/services/event.service";

const db = createDb(env.DB);
const service = () => new EventService(env.DB);

const seedTanzaku = async (id: string, eventId: string | null) => {
  await db.insert(tanzaku).values({
    id,
    content: `内容${id}`,
    userName: `名前${id}`,
    createdAt: nowForDb(),
    eventId
  });
};

describe("createEvent", () => {
  it("isActive=false で作成し、作成行を返す", async () => {
    const created = await service().createEvent({
      name: "七夕2026",
      description: "説明文"
    });
    expect(created.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(created.name).toBe("七夕2026");
    expect(created.description).toBe("説明文");
    expect(created.isActive).toBe(false);
    expect(created.createdAt).toMatch(/Z$/);
  });

  it("description 省略時は null", async () => {
    const created = await service().createEvent({ name: "桜まつり" });
    expect(created.description).toBeNull();
  });
});

describe("getAllEvents", () => {
  it("_count.tanzakus 付き・createdAt 降順で返す(管理画面互換の形状)", async () => {
    const s = service();
    const ev1 = await s.createEvent({ name: "古い" });
    const ev2 = await s.createEvent({ name: "新しい" });
    await seedTanzaku("tz-1", ev1.id);
    await seedTanzaku("tz-2", ev1.id);
    await seedTanzaku("tz-legacy", null);

    const events = await s.getAllEvents();
    expect(events).toHaveLength(2);
    const byId = new Map(events.map((e) => [e.id, e]));
    expect(byId.get(ev1.id)?._count).toEqual({ tanzakus: 2 });
    expect(byId.get(ev2.id)?._count).toEqual({ tanzakus: 0 });
  });
});

describe("activateEvent / deactivateAll", () => {
  it("対象のみ有効化し、他は無効化される(排他的)", async () => {
    const s = service();
    const ev1 = await s.createEvent({ name: "A" });
    const ev2 = await s.createEvent({ name: "B" });

    await s.activateEvent(ev1.id);
    expect((await s.getActiveEvent())?.id).toBe(ev1.id);

    await s.activateEvent(ev2.id);
    const active = await s.getActiveEvent();
    expect(active?.id).toBe(ev2.id);

    const all = await s.getAllEvents();
    expect(all.filter((e) => e.isActive)).toHaveLength(1);
  });

  it("存在しない ID は throw する", async () => {
    await expect(service().activateEvent("missing")).rejects.toThrow(
      "Event not found: missing"
    );
  });

  it("deactivateAll で全て無効化される", async () => {
    const s = service();
    const ev = await s.createEvent({ name: "A" });
    await s.activateEvent(ev.id);
    await s.deactivateAll();
    expect(await s.getActiveEvent()).toBeNull();
  });
});
