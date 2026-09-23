# AI Web Factory

Web制作案件を 受付 → 整理 → 仕様書 → 承認 → 制作 → 品質確認 → 修正 → 納品準備 まで管理する制作システムです。

現在は2つの動作モードを持っています。

- local: Windows PC + SQLite。従来のローカル制作機能をすべて利用
- cloud: Supabase Auth + Postgres。PC/スマホ共通ログインで案件管理と承認

外部AI APIはまだ接続していません。

## Local mode

現在の完成済みローカル版です。

- 案件登録・編集・検索・絞り込み
- ローカル案件分析
- 不足情報・顧客確認事項整理
- 制作仕様書生成・版管理・承認
- 制作開始・最終納品の明示承認
- 静的Webサイト生成
- ローカルプレビュー
- 品質チェック
- 定型修正
- 納品用フォルダ書き出し
- SQLite保存・バックアップ
- Windows 1クリック起動

保存先:

- DB: data/ai-web-factory.db
- Backup: data/backups/
- Generated: data/generated/
- Export: data/exports/

## Cloud mode

Supabaseを設定するとログイン式に切り替えられます。

現在のクラウド対応範囲:

- メールアドレス + パスワードログイン
- PC/スマホで同じ案件一覧を表示
- 案件登録・編集
- 検索・ステータス絞り込み
- 案件詳細・操作履歴
- ステータス進行
- 制作開始承認
- 最終納品承認
- ユーザーごとのデータ分離
- スマホのホーム画面から開きやすいWebアプリ設定

SupabaseのRow Level Securityで owner_id と auth.uid() を照合し、他ユーザーの案件を読めない構成にしています。

工程変更と重要承認はPostgres関数側でも検証します。ブラウザからstatus列を直接更新する権限は与えません。

### Cloud modeでまだPC側に残しているもの

- ローカル分析
- 仕様書生成
- サイト生成
- プレビュー生成
- 品質チェック
- 定型修正
- 納品ファイル生成

これらは次のクラウド移行段階でStorage/クラウド実行へ移します。現時点のスマホ版は「案件管理・確認・承認」を担当します。

## Cloud setup

詳しい手順は docs/CLOUD_SETUP.md を参照してください。

必要な環境変数:

- VITE_APP_MODE=cloud
- VITE_SUPABASE_URL
- VITE_SUPABASE_PUBLISHABLE_KEY

service_role key はフロントエンドへ絶対に設定しません。

## ローカルURL

- Web: http://127.0.0.1:5173
- API: http://127.0.0.1:8787

## 自動確認

npm run verify

GitHub Actionsでは以下を確認します。

1. 依存パッケージのセキュリティ監査
2. TypeScript型チェック
3. API・永続化・分析・制作フロー自動テスト
4. 本番ビルド

## 安全ルール

- 存在しない顧客情報を作らない
- 不明情報は不明のまま保持
- 顧客情報を勝手に変更しない
- 制作開始を自動承認しない
- 最終納品を自動承認しない
- 顧客連絡・課金・契約・ドメイン・DNS・本番公開を自動実行しない
- ステータスを飛ばさない
- 重要操作を履歴に残す
- service_roleなどの秘密鍵をブラウザへ置かない
