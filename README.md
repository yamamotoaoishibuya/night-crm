# Night CRM v1.4.0

## 今回の追加
- 顧客名をフォルダとして表示
- 顧客フォルダを開くと「最終来店日・最終使用金額・最終備考」を表示
- 「＋ 来店記録を追加」
  - 来店日
  - その日の使用金額
  - その日の備考
- 「累計来店履歴を見る」
- 来店履歴は新しい順に蓄積
- 左端から右へスワイプで1画面戻る
- 戻るボタンも残す
- 管理者の全体検索から顧客フォルダを開ける

## 更新手順
1. ZIPを展開
2. GitHubの既存 `night-crm` を開く
3. 右上の `＋` → `Upload files`
4. `night-crm-v1.4.0` フォルダの中身を全部アップロード
5. Commit message：`Update to v1.4.0`
6. `Commit changes`
7. Vercel → `Deployments` → 最新が `Ready` になるまで待つ
8. Night CRMを再読み込み
   - Mac：Command + Shift + R
   - iPhone：Safariで再読み込み

## 今回不要
- Supabase SQL追加なし
- Vercel環境変数追加なし

既存の `visit_histories` テーブルを使用します。

前の安定版：v1.3.1
今回の試用版：v1.4.0
