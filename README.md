# Night CRM v1.1.0

## 今回の変更
- 管理者の最初の画面をキャスト一覧に変更
- キャスト名を押すと、その子の顧客一覧を表示
- キャストフォルダ内から顧客追加すると担当を自動設定
- 管理者の全体検索は全キャストの顧客が対象
- 検索結果には担当キャスト名を表示
- キャスト側は自分の顧客だけ表示
- 管理者画面からキャスト追加可能

## Vercelで追加する環境変数
`SUPABASE_SERVICE_ROLE_KEY`

Supabaseの Settings → API Keys にある service_role / secret key を使ってください。
このキーは絶対に `NEXT_PUBLIC_` を付けず、Vercelだけに保存してください。

## 更新手順
1. ZIPを展開
2. GitHubの既存 night-crm リポジトリへ中身を上書き
3. Vercelへ `SUPABASE_SERVICE_ROLE_KEY` を追加
4. 自動デプロイ完了後、管理者でログイン
5. 「＋ キャスト追加」から動作確認

安定版バックアップ：v1.0.1
今回の試用版：v1.1.0
