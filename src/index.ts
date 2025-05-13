import { Hono } from "hono";
import auth from "./routes/auth";
import admin from "./routes/admin";
import tanzaku from "./routes/tanzaku";

const app = new Hono<{ Bindings: CloudflareBindings }>();
app.get("/", (c) => {
  return c.text("Hello Hono!");
});

app.route("/auth", auth);
app.route("/admin", admin);
app.route("/tanzaku", tanzaku);
export default app;
