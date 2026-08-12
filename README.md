# Night CRM v1.6.0

今回の追加：
- 来店履歴に「一緒に来た人」を名前で追加
- 同伴者ごとに 本指名 / 場内 / 指名なし を保存
- 累計来店履歴にも名前と種別を表示
- 基本情報にボトル番号 / ボトル名
- 既存顧客の基本情報編集から、初回来店日と初回の本指名 / 場内を修正
- 日付入力を 年 / 月 / 日 の選択式へ統一
- ボトル番号・ボトル名も全顧客検索対象
- 戻るスワイプの固定ルールを維持

## Supabase SQL
今回はDB項目が増えるため、1回だけSQL実行が必要です。

```sql
alter table public.customers
add column if not exists bottle_number text;

alter table public.customers
add column if not exists bottle_name text;

alter table public.visit_histories
add column if not exists companions jsonb not null default '[]'::jsonb;

update public.visit_histories
set companions = '[]'::jsonb
where companions is null;
```

## 更新手順
1. ZIPを展開
2. GitHub `night-crm`
3. `＋` → `Upload files`
4. v1.6.0の中身を全部アップロード
5. `Update to v1.6.0` でCommit
6. Supabase SQL Editorで上記SQLをRun
7. Vercel DeploymentsでReady確認
8. Night CRM再読み込み

Vercel環境変数の追加は不要。

参照元：v1.5.2
今回：v1.6.0
戻す場合：v1.5.2
