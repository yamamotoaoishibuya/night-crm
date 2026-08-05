# Night CRM v1.3.1

## 修正内容
- 管理者がメールアドレスでログインできない不具合を修正
- キャストはこれまで通り1〜3桁の数字IDでログイン
- 管理者は実在メールアドレスでログイン
- ログイン欄は以下の両方に対応
  - キャスト：例 `82`
  - 管理者：例 `yamamoto@example.com`

## 更新手順
1. ZIPを展開
2. GitHubの既存 `night-crm` リポジトリを開く
3. 右上の `＋` → `Upload files`
4. 展開した `night-crm-v1.3.1` フォルダの中身を全部アップロード
5. コメントに `Update to v1.3.1` と入力
6. `Commit changes`
7. Vercelの `Deployments` で一番上が `Ready` になるまで待つ
8. Night CRMを強制再読み込み
   - Mac：Command + Shift + R

## 今回不要な作業
- Supabase SQLの追加なし
- Vercel環境変数の追加なし

前の安定版：v1.3.0
今回の修正版：v1.3.1
