// validationResult の値の取り決め:
//   0 = 適切(承認済み・ウォール表示)
//   1 = 不適切(NG・非表示)
export const VALIDATION_OK = 0;
export const VALIDATION_NG = 1;

// 検証モデル: Llama 4 Scout(MoE・ネイティブ多言語=日本語対応・131k context)。
// 旧 llama-3.3-70b は重く応答を支配していたため差し替え。コストも現行よりわずかに低い。
const MODERATION_MODEL = "@cf/meta/llama-4-scout-17b-16e-instruct";

// テストでモックを注入できるよう、Workers AI バインディングのうち
// 使用する run() だけを切り出した最小インターフェース
export type ModerationAi = {
  run(
    model: string,
    options: {
      messages: { role: string; content: string }[];
      guided_json: Record<string, unknown>;
    }
  ): Promise<unknown>;
};

// AI のレスポンス(文字列/オブジェクト混在・前後に余計な文章が付くことがある)から
// validationResult(0/1) を頑健に取り出す。取り出せなければ null。
export const extractValidationResult = (raw: unknown): number | null => {
  const responseField =
    typeof raw === "object" && raw !== null && "response" in raw
      ? (raw as { response: unknown }).response
      : raw;

  // すでにオブジェクト({ result: number })で返る場合
  if (
    responseField &&
    typeof responseField === "object" &&
    typeof (responseField as { result?: unknown }).result === "number"
  ) {
    const v = (responseField as { result: number }).result;
    return v === VALIDATION_OK || v === VALIDATION_NG ? v : null;
  }

  if (typeof responseField !== "string") {
    return null;
  }

  // 1) 文字列全体が JSON
  try {
    const obj = JSON.parse(responseField) as { result?: unknown };
    if (obj && typeof obj.result === "number") {
      return obj.result === VALIDATION_OK || obj.result === VALIDATION_NG
        ? obj.result
        : null;
    }
  } catch {
    // フォールバックに進む
  }

  // 2) 文中に埋め込まれた "result": 0/1 を拾う(前後に説明文があっても可)。
  //    モデルが暴走して複数の result を羅列することがあるため、全件を集めて
  //    値が一意のときだけ採用する。0 と 1 が混在=曖昧なら null を返して
  //    安全側(呼び出し元で非表示=1)に倒す。最初の一致を盲信しない。
  const matches = [...responseField.matchAll(/result["']?\s*[:=]\s*([01])/gi)];
  const distinct = new Set(matches.map((m) => Number(m[1])));
  if (distinct.size === 1) {
    return [...distinct][0];
  }

  // 一致なし、または 0/1 が混在して判別不能
  return null;
};

export const validateTanzaku = async (
  ai: ModerationAi,
  text: string
): Promise<number> => {
  // prompt 形式だと few-shot 例文の「続き」を生成してしまい構造化出力が崩れるため、
  // チャット(messages)形式 + 厳格な system 指示で 1 件だけを判定させる。
  const raw = await ai.run(MODERATION_MODEL, {
    messages: [
      {
        role: "system",
        content:
          "あなたは七夕の短冊メッセージの校閲者です。与えられたメッセージ1件が、公序良俗に反して明らかに不適切なら 1、適切なら 0 と判定します。" +
          ' 出力は必ず {"result":0} または {"result":1} という JSON オブジェクトだけにし、理由や説明など他のテキストは一切含めないでください。\n' +
          '判定例:\n「楽しい七夕です!」→ {"result":0}\n「爆発しそうなくらい楽しい」→ {"result":0}\n' +
          '「A先生キショい」→ {"result":1}\n「蓮舫蓮舫蓮舫蓮舫」→ {"result":1}\n' +
          '「大学の自治を守ろう」→ {"result":0}\n「美味しいカレーが食べたい」→ {"result":0}\n' +
          '「中央大学を爆破する」→ {"result":1}'
      },
      { role: "user", content: text }
    ],
    guided_json: {
      type: "object",
      properties: {
        result: {
          type: "number",
          enum: [0, 1]
        }
      },
      required: ["result"]
    }
  });

  const value = extractValidationResult(raw);
  if (value === null) {
    console.error("Could not parse validation result from AI response:", raw);
    throw new Error("Failed to parse AI response");
  }
  return value;
};
