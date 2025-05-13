import { googleAuth } from "@hono/oauth-providers/google";
import { Hono } from "hono";
import { AuthService } from "../services/auth.service";

const auth = new Hono<{ Bindings: CloudflareBindings }>();

auth.get(
  "/google",
  googleAuth({
    scope: ["openid", "email", "profile"],
  }),
  async (c) => {
    const user = c.get("user-google");
    const authService = new AuthService(c.env.DB);

    try {
      const tokens = await authService.handleGoogleAuth(user, c.env.JWT_SECRET);
      return c.redirect(
        `${c.env.FRONTEND_BASEURL}/auth?${new URLSearchParams(
          tokens
        ).toString()}`
      );
    } catch (e) {
      console.error(e);
      return c.json({ error: "Something Wrong" }, 500);
    }
  }
);

auth.post("/signup", async (c) => {
  const { email, password } = await c.req.json();
  const authService = new AuthService(c.env.DB);

  try {
    const tokens = await authService.signup(email, password, c.env.JWT_SECRET);
    return c.json(tokens);
  } catch (e) {
    console.error(e);
    return c.json({ error: "Something Wrong" }, 500);
  }
});

auth.post("/login", async (c) => {
  const { email, password } = await c.req.json();
  const authService = new AuthService(c.env.DB);

  try {
    const tokens = await authService.login(email, password, c.env.JWT_SECRET);
    return c.json(tokens);
  } catch (e) {
    console.error(e);
    return c.json({ error: "Something Wrong" }, 500);
  }
});

auth.post("/refresh", async (c) => {
  const { refreshToken } = await c.req.json();
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
