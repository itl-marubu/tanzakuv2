import { describe, expect, it } from "vitest";
import {
  type ModerationAi,
  extractValidationResult,
  validateTanzaku
} from "../src/services/moderation.service";

describe("extractValidationResult", () => {
  it("{ result: number } オブジェクトをそのまま採用する", () => {
    expect(extractValidationResult({ result: 0 })).toBe(0);
    expect(extractValidationResult({ result: 1 })).toBe(1);
  });

  it("response フィールドに包まれたオブジェクトを解決する", () => {
    expect(extractValidationResult({ response: { result: 1 } })).toBe(1);
    expect(extractValidationResult({ response: '{"result":0}' })).toBe(0);
  });

  it("JSON 文字列をパースする", () => {
    expect(extractValidationResult('{"result":1}')).toBe(1);
  });

  it("説明文に埋め込まれた result を正規表現で拾う", () => {
    expect(
      extractValidationResult('判定します。{"result": 0} 以上です。')
    ).toBe(0);
    expect(extractValidationResult("result = 1 と判断しました")).toBe(1);
  });

  it("複数の result が同値なら採用する", () => {
    expect(extractValidationResult('{"result":1} {"result":1}')).toBe(1);
  });

  it("0/1 が混在したら null(判別不能)", () => {
    expect(extractValidationResult('{"result":0} {"result":1}')).toBeNull();
  });

  it("0/1 以外の数値は null", () => {
    expect(extractValidationResult({ result: 2 })).toBeNull();
  });

  it("解釈不能な入力は null", () => {
    expect(extractValidationResult("こんにちは")).toBeNull();
    expect(extractValidationResult(undefined)).toBeNull();
    expect(extractValidationResult(null)).toBeNull();
    expect(extractValidationResult(42)).toBeNull();
  });
});

describe("validateTanzaku", () => {
  const aiReturning = (raw: unknown): ModerationAi => ({
    run: async () => raw
  });

  it("AI 応答から判定値を返す", async () => {
    await expect(
      validateTanzaku(aiReturning({ result: 0 }), "楽しい")
    ).resolves.toBe(0);
    await expect(
      validateTanzaku(aiReturning({ response: '{"result":1}' }), "不適切")
    ).resolves.toBe(1);
  });

  it("判定対象テキストを user メッセージとして渡す", async () => {
    let captured: string | undefined;
    const ai: ModerationAi = {
      run: async (_model, options) => {
        captured = options.messages.find((m) => m.role === "user")?.content;
        return { result: 0 };
      }
    };
    await validateTanzaku(ai, "願いごと太郎");
    expect(captured).toBe("願いごと太郎");
  });

  it("パース不能なら throw する(呼び出し元で非表示=1 に倒す)", async () => {
    await expect(
      validateTanzaku(aiReturning("判定できません"), "テスト")
    ).rejects.toThrow("Failed to parse AI response");
  });
});
