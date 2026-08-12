# Night CRM v1.4.1

## 修正・追加
- iPhone/Safariの「左端から右スワイプ」で前画面へ戻れるようにブラウザ履歴と連動
- 顧客一覧に「最終来店日の指名種別」を表示
  - 本指名
  - 場内
  - 通常
- 顧客一覧に「最終本指名日」「最終場内日」も表示
- 来店記録追加時に指名種別を選択可能
- 顧客一覧の並び順を切替可能
  - 登録順（基本・デフォルト）
  - 最終来店日順
  - 最終本指名日順
  - 最終場内日順
- 累計来店履歴にも指名種別を表示

## 更新手順
1. ZIPを展開
2. GitHubの既存 `night-crm` を開く
3. 右上の `＋` → `Upload files`
4. `night-crm-v1.4.1` フォルダの中身を全部アップロード
5. Commit message：`Update to v1.4.1`
6. `Commit changes`
7. Vercel → `Deployments` → 最新が `Ready` になるまで待つ
8. Night CRMを再読み込み

## 今回不要
- Supabase SQL追加なし
- Vercel環境変数追加なし

前の安定版：v1.4.0
今回の試用版：v1.4.1
