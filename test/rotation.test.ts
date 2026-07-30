import { describe, expect, it } from "vitest";
import {
  FRESH_RESERVED_SLOTS,
  FRESH_WINDOW_MS,
  hashSeed,
  rotationOffset,
  splitWindow,
  windowIndexFromClock
} from "../src/lib/rotation";

describe("定数", () => {
  it("新着窓は60秒・予約枠は2", () => {
    expect(FRESH_WINDOW_MS).toBe(60_000);
    expect(FRESH_RESERVED_SLOTS).toBe(2);
  });
});

describe("hashSeed", () => {
  it("同じ文字列には常に同じ値を返す(決定的)", () => {
    expect(hashSeed("abc123")).toBe(hashSeed("abc123"));
  });

  it("FNV-1a(32bit)の既知値と一致する", () => {
    expect(hashSeed("")).toBe(2166136261); // FNV offset basis そのもの
    expect(hashSeed("a")).toBe(3826002220);
    expect(hashSeed("abc123")).toBe(951228933);
  });

  it("異なる文字列は(基本的に)異なる値になる", () => {
    expect(hashSeed("seed-1")).not.toBe(hashSeed("seed-2"));
  });

  it("常に非負の32bit整数(0〜2^32-1)を返す", () => {
    const h = hashSeed("some-long-random-seed-value-1234567890");
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThanOrEqual(2 ** 32 - 1);
    expect(Number.isInteger(h)).toBe(true);
  });
});

describe("windowIndexFromClock", () => {
  it("エポックからの経過ミリ秒を intervalMs で割った整数部を返す", () => {
    expect(windowIndexFromClock(new Date(0))).toBe(0);
    expect(windowIndexFromClock(new Date(60_000))).toBe(1);
    expect(windowIndexFromClock(new Date(119_999))).toBe(1);
    expect(windowIndexFromClock(new Date(120_000))).toBe(2);
  });

  it("intervalMs を明示指定できる", () => {
    expect(windowIndexFromClock(new Date(5_000), 1_000)).toBe(5);
  });
});

describe("rotationOffset", () => {
  it("poolCount<=0 なら 0 を返す", () => {
    expect(rotationOffset(0, 0, 5, 0)).toBe(0);
    expect(rotationOffset(3, 123, 5, -1)).toBe(0);
  });

  it("window=0・seedHash=0 ならオフセットは0", () => {
    expect(rotationOffset(0, 0, 5, 10)).toBe(0);
  });

  it("window が進むと slotsPerWindow 分だけオフセットが進む", () => {
    expect(rotationOffset(1, 0, 5, 100)).toBe(5);
    expect(rotationOffset(2, 0, 5, 100)).toBe(10);
  });

  it("同一 window・同一 seed は常に同一オフセット(再現性)", () => {
    const a = rotationOffset(7, hashSeed("seed-x"), 3, 17);
    const b = rotationOffset(7, hashSeed("seed-x"), 3, 17);
    expect(a).toBe(b);
  });

  it("window+1 でオフセットが変わる(入れ替わり)", () => {
    const seedHash = hashSeed("seed-x");
    const k0 = rotationOffset(0, seedHash, 3, 17);
    const k1 = rotationOffset(1, seedHash, 3, 17);
    expect(k0).not.toBe(k1);
  });

  it("seed が変わるとオフセットが変わる(入れ替わり)", () => {
    const a = rotationOffset(4, hashSeed("seed-a"), 3, 17);
    const b = rotationOffset(4, hashSeed("seed-b"), 3, 17);
    expect(a).not.toBe(b);
  });

  it("poolCount で mod され、常に 0〜poolCount-1 の範囲に収まる", () => {
    const offset = rotationOffset(999999, hashSeed("wrap"), 5, 7);
    expect(offset).toBeGreaterThanOrEqual(0);
    expect(offset).toBeLessThan(7);
  });
});

describe("splitWindow", () => {
  it("poolCount<=0 または limit<=0 なら空配列", () => {
    expect(splitWindow(0, 5, 0)).toEqual([]);
    expect(splitWindow(0, 0, 5)).toEqual([]);
    expect(splitWindow(0, -1, 5)).toEqual([]);
  });

  it("ラップなし(offset+limit<=poolCount)なら1範囲のみ", () => {
    expect(splitWindow(2, 3, 10)).toEqual([{ offset: 2, limit: 3 }]);
  });

  it("末尾に達したら先頭へラップし2範囲になる", () => {
    // poolCount=10, offset=8, limit=5 → [8,9](2件) + [0,1,2](3件)
    expect(splitWindow(8, 5, 10)).toEqual([
      { offset: 8, limit: 2 },
      { offset: 0, limit: 3 }
    ]);
  });

  it("ちょうど末尾で終わる場合はラップしない(1範囲)", () => {
    expect(splitWindow(7, 3, 10)).toEqual([{ offset: 7, limit: 3 }]);
  });

  it("limit が poolCount を超える場合は poolCount に clamp し重複しない", () => {
    expect(splitWindow(0, 100, 4)).toEqual([{ offset: 0, limit: 4 }]);
  });

  it("limit が poolCount 超過かつラップする場合も重複なく clamp される", () => {
    // poolCount=4, offset=3 → 全件読むと [3](1件)+[0,1,2](3件)で4件、重複なし
    expect(splitWindow(3, 10, 4)).toEqual([
      { offset: 3, limit: 1 },
      { offset: 0, limit: 3 }
    ]);
  });

  it("offset が poolCount 以上でも正規化される", () => {
    expect(splitWindow(13, 2, 10)).toEqual([{ offset: 3, limit: 2 }]);
  });

  it("poolCount=1・limit=1 の境界", () => {
    expect(splitWindow(0, 1, 1)).toEqual([{ offset: 0, limit: 1 }]);
  });
});
