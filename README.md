# AI Web Factory

Web制作案件の受付・管理・AI分析・制作仕様書・承認・制作・テスト・修正・納品を、できるだけAIへ移管するための制作管理システムです。

現在は **1人用・ローカル専用** として開発しています。ログイン機能やクラウド公開はまだ入れません。

## 現在のPhase

Phase 1の最初の実装です。

- 案件の手動登録
- 案件一覧
- 案件詳細
- ステータスの土台
- SQLiteへのローカル保存
- AI分析データの保存領域
- 制作仕様書データの保存領域
- 承認履歴・変更履歴の保存領域

AI APIはまだ接続していません。

## ローカル専用

開発サーバーとAPIはどちらも `127.0.0.1` に固定しています。

- Web画面: http://127.0.0.1:5173
- API: http://127.0.0.1:8787
- DB: `data/ai-web-factory.db`

SQLiteのDBファイルは `.gitignore` でGitHubへ送信しない設定です。

## 必要環境

- Node.js 22以上
- npm

## 起動方法

リポジトリをPCへ取得したあと、ルートフォルダで実行します。

```bash
npm install
npm run dev
```

ブラウザで以下を開きます。

```text
http://127.0.0.1:5173
```

終了するときは、起動中のターミナルで `Ctrl + C` を押します。

## フォルダ構成

```text
ai-web-factory/
├─ frontend/        React + TypeScript + Vite
├─ backend/         Express + TypeScript
├─ data/            SQLite保存先（DB本体はGit管理しない）
├─ package.json
└─ README.md
```

## データ構造

Phase 1から将来拡張を見越して以下を分離しています。

- `projects`: 案件本体
- `project_analyses`: AI案件分析
- `project_specs`: 制作仕様書
- `project_approvals`: 人間による承認
- `project_history`: 操作・状態変更履歴

## 重要ルール

- 不明情報をAIが勝手に作らない
- 顧客情報を勝手に変更しない
- APIキーや秘密情報をGitHubへ保存しない
- 制作開始・顧客への連絡・課金・ドメイン購入・DNS変更・本番公開・最終納品は明示承認を必須にする
- モバイルファースト、レスポンシブ、SEO基本対応、アクセシビリティを考慮する
- 変更後はビルド・テストを確認する

## 次の開発

1. 案件編集・ステータス変更
2. AI案件分析
3. 不足情報・顧客確認事項の生成
4. 制作仕様書生成
5. 承認・差し戻し
6. AIによるWeb制作
