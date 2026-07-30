import { describe, expect, it } from "vitest";
import { dateForDb, nowForDb, parseDbDate, toApiDate } from "../src/lib/dates";

describe("parseDbDate", () => {
  it("SQLite 形式(YYYY-MM-DD HH:MM:SS)を UTC として解釈する", () => {
    const d = parseDbDate("2025-06-21 10:00:00");
    expect(d.toISOString()).toBe("2025-06-21T10:00:00.000Z");
  });

  it("ISO 8601(Z・ミリ秒あり)を解釈する", () => {
    const d = parseDbDate("2025-06-21T10:00:00.123Z");
    expect(d.toISOString()).toBe("2025-06-21T10:00:00.123Z");
  });

  it("ISO 8601(Z・ミリ秒なし)を解釈する", () => {
    const d = parseDbDate("2025-06-21T10:00:00Z");
    expect(d.toISOString()).toBe("2025-06-21T10:00:00.000Z");
  });

  it("ISO 8601(+00:00 オフセット)を解釈する", () => {
    const d = parseDbDate("2025-06-21T10:00:00.000+00:00");
    expect(d.toISOString()).toBe("2025-06-21T10:00:00.000Z");
  });

  it("ISO 8601(+09:00 オフセット)を UTC に正規化する", () => {
    const d = parseDbDate("2025-06-21T19:00:00+09:00");
    expect(d.toISOString()).toBe("2025-06-21T10:00:00.000Z");
  });
});

describe("toApiDate", () => {
  it("両形式を同一の ISO 出力に正規化する", () => {
    expect(toApiDate("2025-06-21 10:00:00")).toBe("2025-06-21T10:00:00.000Z");
    expect(toApiDate("2025-06-21T10:00:00.000Z")).toBe(
      "2025-06-21T10:00:00.000Z"
    );
  });
});

describe("nowForDb / dateForDb", () => {
  it("ISO 8601(Z)形式で出力する", () => {
    expect(nowForDb()).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(dateForDb(new Date("2025-06-21T10:00:00.000Z"))).toBe(
      "2025-06-21T10:00:00.000Z"
    );
  });

  it("nowForDb の出力は parseDbDate で往復できる", () => {
    const s = nowForDb();
    expect(parseDbDate(s).toISOString()).toBe(s);
  });
});
