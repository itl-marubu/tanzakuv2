import { describe, expect, it } from "vitest";
import { newCuid, newUuid } from "../src/lib/id";

describe("id generators", () => {
  it("newUuid は UUID v4 形式", () => {
    expect(newUuid()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    );
  });

  it("newCuid は cuid2 形式(英小文字始まり・24文字)", () => {
    expect(newCuid()).toMatch(/^[a-z][a-z0-9]{23}$/);
  });

  it("毎回異なる値を生成する", () => {
    expect(newUuid()).not.toBe(newUuid());
    expect(newCuid()).not.toBe(newCuid());
  });
});
