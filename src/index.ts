import { Hono } from "hono";
import { cors } from "hono/cors";
import config from "./routes/config.route";
import manage from "./routes/manage.route";
import tanzaku from "./routes/tanzaku.route";

const app = new Hono<{ Bindings: CloudflareBindings }>();
app.get("/", (c) => {
  return c.text("Hello Hono!");
});
app.use(
  "*",
  cors({
    origin: "*",
    allowMethods: ["GET", "POST", "OPTIONS", "PUT", "DELETE"],
    allowHeaders: ["Content-Type", "Authorization"],
    exposeHeaders: ["Content-Length", "X-Kuma-Revision"],
    maxAge: 600,
    credentials: true
  })
);

app.route("/tanzaku", tanzaku);
app.route("/config", config);
app.get("/manage/", (c) => c.redirect("/manage"));
app.route("/manage", manage);
export default app;
