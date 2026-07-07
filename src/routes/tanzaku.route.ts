import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { createTanzakuSchema } from "../schemas/tanzaku.schema";
import { TanzakuService } from "../services/tanzaku.service";

const tanzaku = new Hono<{ Bindings: CloudflareBindings }>();

tanzaku.get("/", async (c) => {
  const service = new TanzakuService(c.env.DB);
  const result = await service.getAllTanzaku();

  return c.json(result);
});

tanzaku.post("/", zValidator("json", createTanzakuSchema), async (c) => {
  const { content, userName } = c.req.valid("json");

  const service = new TanzakuService(c.env.DB);
  const result = await service.createTanzaku({ content, userName }, c.env.AI);

  return c.json(result);
});

tanzaku.get("/check/:id", async (c) => {
  const { id } = c.req.param();
  const service = new TanzakuService(c.env.DB);
  const result = await service.getTanzakuById(id);

  if (!result) {
    return c.json({ error: "Tanzaku not found" }, 404);
  }

  return c.json(result);
});

tanzaku.get("/client", async (c) => {
  const service = new TanzakuService(c.env.DB);
  // 旧実装と同一の解釈: 正の整数のみ採用、それ以外は 10(サービス側で 1〜30 に clamp)
  const limitQuery = c.req.query("limit");
  const parsedLimit = Number.parseInt(limitQuery ?? "", 10);
  const limit =
    Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : 10;
  const result = await service.getClientTanzaku(limit);

  return c.json(result);
});

export default tanzaku;
