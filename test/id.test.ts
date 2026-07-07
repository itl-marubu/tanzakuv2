import { describe, expect, it } from "vitest";
import { newUuid } from "../src/lib/id";

describe("id generators", () => {
  it("newUuid は UUID v4 形式", () => {
    expect(newUuid()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    );
  });

  it("毎回異なる値を生成する", () => {
    expect(newUuid()).not.toBe(newUuid());
  });
});
