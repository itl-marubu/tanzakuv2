import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import {
  clientTanzakuQuerySchema,
  createTanzakuSchema
} from "../schemas/tanzaku.schema";
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

tanzaku.get(
  "/client",
  zValidator("query", clientTanzakuQuerySchema),
  async (c) => {
    const { limit, window, seed } = c.req.valid("query");
    const service = new TanzakuService(c.env.DB);
    const result = await service.getClientTanzaku({ limit, window, seed });

    return c.json(result);
  }
);

export default tanzaku;
