import { Hono } from "hono";
import { cors } from "hono/cors";
import admin from "./routes/admin";
import auth from "./routes/auth";
import tanzaku from "./routes/tanzaku";

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

app.route("/auth", auth);
app.route("/admin", admin);
app.route("/tanzaku", tanzaku);
export default app;
