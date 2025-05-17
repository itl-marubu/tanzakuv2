import { Hono } from "hono";
import { TanzakuService } from "../services/tanzaku.service";
import { cors } from "hono/cors";

const tanzaku = new Hono<{ Bindings: CloudflareBindings }>();

tanzaku.get("/", async (c) => {
  const service = new TanzakuService(c.env.DB);
  const result = await service.getAllTanzaku();

  return c.json(result);
});

tanzaku.post("/", async (c) => {
  const { content, userName } = await c.req.json<{
    content: string;
    userName: string;
  }>();

  const service = new TanzakuService(c.env.DB);
  const result = await service.createTanzaku({ content, userName });

  return c.json(result);
});

tanzaku.get("/:id", async (c) => {
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
  const result = await service.getTwentyTanzaku();

  return c.json(result);
});

export default tanzaku;
