import { Hono } from "hono";
import { jwt } from "hono/jwt";
import { TanzakuService } from "../services/tanzaku.service";

const admin = new Hono<{ Bindings: CloudflareBindings }>();

admin.use("*", (c, next) => {
  const jwtMiddleware = jwt({
    secret: c.env.JWT_SECRET
  });
  return jwtMiddleware(c, next);
});

admin.get("/tanzakus", async (c) => {
  const service = new TanzakuService(c.env.DB);
  const result = await service.getAllTanzaku();

  return c.json(result);
});

admin.post("/tanzakus", async (c) => {
  const service = new TanzakuService(c.env.DB);
  try {
    await service.editTanzaku(
      await c.req.json<
        Array<
          | {
              id: string;
              operation: "delete";
            }
          | {
              id: string;
              operation: "update";
              title: string;
              content: string;
              userName: string;
            }
        >
      >()
    );
  } catch (e) {
    console.error(e);
    return c.json({ error: "Failed to edit tanzaku" }, 500);
  }

  return c.json({ success: true });
});

export default admin;
