# AI Web Factory Architecture

## 基本原則

AI Web Factoryは「AIが作業、人間が重要判断」を基本にする。

重要判断はAIから分離し、バックエンドのルールとして承認を強制する。画面上でボタンを隠すだけの安全対策にはしない。

## 現在の構成

```text
Browser (127.0.0.1:5173)
        |
        | /api
        v
Express API (127.0.0.1:8787)
        |
        v
SQLite
  ├ projects
  ├ project_analyses
  ├ project_specs
  ├ project_approvals
  └ project_history
```

## データ保存

顧客案件データはPC内のSQLiteへ保存する。

```text
data/ai-web-factory.db
```

GitHubへは送信しない。

バックアップ:

```text
data/backups/
```

- 起動時に1日1回、自動作成
- 管理画面から手動作成可能
- 古いバックアップは一定数を超えると自動整理
- 起動時にSQLite integrity_checkを実行

## ステータス

```text
新規
↓
AI分析中
├→ 情報不足 ─┐
└→ 確認待ち ←┘
↓
制作待ち
↓ [制作開始の承認必須]
制作中
↓
AI品質チェック
├→ 修正中 → 再チェック ─┐
└→ ユーザー確認 ──────┤
          ↓             │
       最終確認 ←────────┘
          ↓ [最終納品の承認必須]
         納品
          ↓
         完了
```

API側で許可された遷移だけを受け付ける。

## 承認種別

将来を含め、以下を共通の承認データとして扱う。

- production_start: 制作開始
- customer_contact: 顧客への連絡
- paid_service: 有料サービス契約
- billing: 課金
- domain_purchase: ドメイン購入
- dns_change: DNS変更
- production_publish: 本番公開
- final_delivery: 最終納品

Phase 1では制作開始と最終納品を実際のステータス遷移に連動させている。

## AIを接続するとき

APIキーはフロントエンドへ置かない。

```text
Browser
  ↓
Local Backend
  ↓
AI Provider API
```

AIへの送信前に、案件ごとに送信対象を明確化する。AI結果は事実と推測を分け、不明項目は「不明」「要確認」として保存する。

## 将来クラウド化するとき

現在のローカル版をいきなりクラウド公開しない。以下を追加してから移行する。

- ログイン
- 組織 / workspace
- ロール・権限
- サーバー側認証
- 暗号化・秘密管理
- 監査ログ
- レート制限
- バックアップ / 復旧
- 利用規約・プライバシー設計
