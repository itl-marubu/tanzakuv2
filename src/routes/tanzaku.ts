import { Hono } from "hono";
import { TanzakuService } from "../services/tanzaku.service";

const tanzaku = new Hono<{ Bindings: CloudflareBindings }>();

tanzaku.get("/", (c) => {
  return c.text("Hello World");
});

tanzaku.post("/", async (c) => {
  const { title, content, userName } = await c.req.json<{
    title: string;
    content: string;
    userName: string;
  }>();

  const service = new TanzakuService(c.env.DB);
  const result = await service.createTanzaku({ title, content, userName });

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
