import { Hono } from "hono";
import admin from "./routes/admin";
import auth from "./routes/auth";
import tanzaku from "./routes/tanzaku";
import { cors } from "hono/cors";

const app = new Hono<{ Bindings: CloudflareBindings }>();
app.get("/", (c) => {
  return c.text("Hello Hono!");
});
app.use("*", cors());

app.route("/auth", auth);
app.route("/admin", admin);
app.route("/tanzaku", tanzaku);
export default app;
