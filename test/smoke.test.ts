import { describe, expect, it } from "vitest";

describe("smoke", () => {
  it("runs inside workerd with D1", async () => {
    const { env } = await import("cloudflare:workers");
    const row = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM Tanzaku"
    ).first<{ n: number }>();
    expect(row?.n).toBe(0);
  });
});
