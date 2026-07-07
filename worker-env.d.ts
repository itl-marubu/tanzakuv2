// wrangler types で生成される CloudflareBindings に、
// wrangler.jsonc では宣言していない Secrets / 環境変数を宣言マージで追加する。
// （`wrangler secret put` や .dev.vars で設定する値の型補完用。worker-configuration.d.ts は再生成で上書きされるため、ここで定義する）
interface CloudflareBindings {
  /** リダイレクト先フロントエンドのベース URL */
  FRONTEND_BASEURL: string;
  /** 管理画面ベーシック認証のユーザー名 */
  ADMIN_ID: string;
  /** 管理画面ベーシック認証のパスワード */
  ADMIN_PWD: string;
}
