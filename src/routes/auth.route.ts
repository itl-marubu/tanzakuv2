import { googleAuth } from "@hono/oauth-providers/google";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { credentialsSchema, refreshSchema } from "../schemas/auth.schema";
import { AuthService } from "../services/auth.service";

const auth = new Hono<{ Bindings: CloudflareBindings }>();

auth.get(
  "/google",
  googleAuth({
    scope: ["openid", "email", "profile"]
  }),
  async (c) => {
    const user = c.get("user-google");
    const authService = new AuthService(c.env.DB);

    try {
      const tokens = await authService.handleGoogleAuth(user, c.env.JWT_SECRET);
      return c.redirect(
        `${c.env.FRONTEND_BASEURL}/auth/google?${new URLSearchParams(
          tokens
        ).toString()}`
      );
    } catch (e) {
      console.error(e);
      return c.json({ error: "Something Wrong" }, 500);
    }
  }
);

auth.post("/signup", zValidator("json", credentialsSchema), async (c) => {
  const { email, password } = c.req.valid("json");
  const authService = new AuthService(c.env.DB);

  try {
    const tokens = await authService.signup(email, password, c.env.JWT_SECRET);
    return c.json(tokens);
  } catch (e) {
    console.error(e);
    return c.json({ error: "Something Wrong" }, 500);
  }
});

auth.post("/login", zValidator("json", credentialsSchema), async (c) => {
  const { email, password } = c.req.valid("json");
  const authService = new AuthService(c.env.DB);

  try {
    const tokens = await authService.login(email, password, c.env.JWT_SECRET);
    return c.json(tokens);
  } catch (e) {
    console.error(e);
    return c.json({ error: "Something Wrong" }, 500);
  }
});

auth.post("/refresh", zValidator("json", refreshSchema), async (c) => {
  const { refreshToken } = c.req.valid("json");
  const authService = new AuthService(c.env.DB);

  try {
    const tokens = await authService.refreshToken(
      refreshToken,
      c.env.JWT_SECRET
    );
    return c.json(tokens);
  } catch (e) {
    console.error(e);
    return c.json({ error: "Invalid refresh token" }, 401);
  }
});

export default auth;
