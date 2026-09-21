# AI Web Factory

AIがWeb制作案件の受付・管理・分析・仕様書作成・制作・テスト・修正・納品を支援するための制作管理システムです。

現在は **1人用・Windows PC内だけで動くローカル版** として開発しています。ログイン、クラウド公開、AI有料APIはまだ接続していません。

## 現在できること

- 案件の手動登録
- 案件一覧・検索・ステータス絞り込み
- 案件詳細
- 案件情報の編集
- 工程の順序管理
- 制作開始の明示承認
- 最終納品の明示承認
- 承認・差し戻し履歴
- 変更・操作履歴
- SQLiteへのローカル保存
- 起動時のSQLite整合性チェック
- 1日1回の自動DBバックアップ
- ボタンからの手動DBバックアップ
- GitHub Actionsによる型チェック・APIテスト・ビルド
- Windowsの1クリック起動

AI案件分析と制作仕様書の保存領域は準備済みですが、AI自体はまだ接続していません。

## ローカル専用

アプリの待受先はループバックアドレスに固定しています。

- Web画面: http://127.0.0.1:5173
- API: http://127.0.0.1:8787
- DB: `data/ai-web-factory.db`
- Backup: `data/backups/`

DBとバックアップは `.gitignore` の対象で、GitHubには保存しません。

## Windowsで使う

### 初回

PowerShellでリポジトリを取得して依存関係を入れます。

```powershell
git clone https://github.com/Keikei-p/ai-web-factory.git
cd ai-web-factory
npm install
```

開発用起動:

```powershell
npm run dev
```

### デスクトップから1クリック起動

リポジトリ内の次のファイルをダブルクリックします。

```text
install-desktop-shortcut.bat
```

デスクトップに以下が作られます。

- AI Web Factory
- AI Web Factory 終了

以降は「AI Web Factory」をダブルクリックするだけです。起動スクリプトは、安全に更新できる場合だけGitHubの最新コードを取得し、依存関係を確認してからブラウザを開きます。

## 自動テスト

```powershell
npm run verify
```

以下をまとめて実行します。

1. TypeScript型チェック
2. API自動テスト
3. 本番ビルド

GitHubへ変更を入れた場合もCIで同じ確認を行います。

## 安全ルール

- 不明情報をAIが勝手に作らない
- 顧客情報を勝手に変更しない
- APIキーや秘密情報をGitHubへ保存しない
- 制作開始は明示承認なしでは進めない
- 最終納品は明示承認なしでは進めない
- 顧客連絡、課金、有料契約、ドメイン購入、DNS変更、本番公開も将来の実装で承認必須にする
- ステータスを飛ばして進行できない
- 重要な操作を履歴へ残す
- DBはPC内に保存し、定期バックアップする

## フォルダ構成

```text
ai-web-factory/
├─ frontend/                  React + TypeScript + Vite
├─ backend/                   Express + TypeScript
├─ data/                      SQLite・バックアップ（Git管理外）
├─ docs/                      設計資料
├─ scripts/                   Windows補助スクリプト
├─ start-ai-web-factory.bat   1クリック起動
├─ stop-ai-web-factory.bat    終了
└─ README.md
```

## データ構造

- `projects`: 案件本体
- `project_analyses`: AI案件分析
- `project_specs`: 制作仕様書
- `project_approvals`: 人間による承認
- `project_history`: 操作・状態変更履歴

## 次の主要開発

1. AI案件分析
2. 不足情報・顧客確認事項の自動抽出
3. 制作仕様書生成
4. 仕様書の承認・差し戻し
5. AIによるWeb制作
6. 自動テスト・AI品質チェック
7. 自然言語修正
8. 外部サービス連携

詳しい構成は `docs/ARCHITECTURE.md` と `docs/PHASE1.md` を参照してください。
