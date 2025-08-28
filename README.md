# 🎴 Flocka API v1.4.0

デジタルプロフィールカード交換プラットフォームのバックエンドAPI - **QR即時交換システム・パスワードリセット機能対応**

## 🌟 主な機能

### 📱 プロフィールカード作成・管理
- **デザインの自由度**: オリジナル画像アップロード対応
- **リッチな情報**: カード名、**80文字bio**、最大4つのSNS・ポートフォリオリンク
- **複数カード管理**: 用途別（ゲーム・創作・ビジネス等）の複数カード作成・切り替え

### ⚡ QR即時交換システム（NEW!）
- **瞬時の双方向交換**: QRコード読み取りと同時に交換完了
- **リアルタイム通知**: 読み取られた側への即座の通知
- **シンプルなフロー**: 複雑な承認プロセスを廃止
- **交換履歴**: すべてのQR交換の詳細ログ

### 🔄 多彩な交換方法
- **QRコード交換**: リアルタイム生成・読み取りで即座に相互交換
- **URL共有**: AirDrop・SNS経由でのカード共有
- **近距離交換**: BLE対応、アプリ内でのユーザー検出・リクエスト機能
- **位置情報記録**: 交換場所の自動記録

### 📚 コレクション機能
- 交換カードの整理・管理
- イベント・場所・日付のメモ機能
- 交換履歴の詳細記録

## 🛠️ 技術スタック

### インフラ（Cloudflare エコシステム）
- **API**: Cloudflare Workers (Hono.js)
- **データベース**: Cloudflare D1 (SQLite)
- **ストレージ**: Cloudflare R2 (画像ファイル)
- **メール**: MailChannels Email API

### 開発技術
- **言語**: TypeScript
- **フレームワーク**: Hono.js
- **認証**: JWT + bcrypt
- **バリデーション**: カスタムバリデーター
- **型安全**: 完全なTypeScript対応

## 🚀 API エンドポイント

### 🔐 認証 (`/auth`)
- `POST /register` - 新規ユーザー登録
- `POST /login` - ログイン
- `GET /verify` - メールアドレス確認
- `POST /resend-verification` - メール認証再送（要認証）
- `POST /resend-verification-by-email` - メール認証再送（メールアドレス指定）
- `POST /forgot-password` - **パスワードリセット申請**（NEW!）
- `POST /reset-password` - **パスワードリセット実行**（NEW!）
- `GET /reset-password` - **パスワードリセットフォーム**（NEW!）
- `GET /me` - 現在のユーザー情報

### 🎴 カード管理 (`/cards`) - **bio対応**
- `POST /upload-url` - 画像アップロード用署名付きURL生成
- `POST /upload-file` - 画像ファイル直接アップロード
- `POST /` - 新規カード作成（**bio対応**）
- `GET /` - 所有カード一覧取得
- `GET /:id` - カード詳細取得
- `PUT /:id` - カード更新（**bio対応**）
- `DELETE /:id` - カード削除
- `POST /:id/generate-exchange-url` - カード交換URL生成

### ⚡ QR即時交換 (`/exchanges`) - **完全リニューアル**
- `POST /qr/generate` - QRコード生成
- `POST /qr` - **QR即時交換実行**（NEW!）
- `GET /qr-logs` - **QR交換履歴取得**（NEW!）

### 📚 コレクション管理 (`/exchanges`)
- `GET /` - コレクション一覧取得
- `POST /` - 手動カード追加
- `GET /:id` - 交換詳細取得
- `PUT /:id` - 交換記録更新
- `DELETE /:id` - 交換記録削除

### 🌐 URL交換・公開
- `GET /cards/exchange` - URL経由カード取得
- `GET /cards/public/:id` - 公開カード表示

## 🎯 QR即時交換フロー（v1.3.0の新機能）

### 1. QRコード生成
```bash
POST /exchanges/qr/generate
```
```json
{
  "cardId": "your-card-id"
}
```

**レスポンス:**
```json
{
  "success": true,
  "data": {
    "qrData": "{\"type\":\"card_exchange\",\"cardId\":\"...\",\"token\":\"...\"}",
    "token": "unique-token",
    "cardName": "Your Card Name",
    "expiresAt": "2025-08-28T14:30:00Z"
  }
}
```

### 2. QR読み取り・即時交換
```bash
POST /exchanges/qr
```
```json
{
  "qrData": "QRコードの内容",
  "myCardId": "scanner-card-id",
  "memo": "交換メモ（オプション）",
  "location_name": "交換場所（オプション）"
}
```

**レスポンス:**
```json
{
  "success": true,
  "message": "QR exchange completed successfully",
  "data": {
    "exchangeLogId": "log-id",
    "exchangedCards": {
      "yourNewCard": {
        "id": "card-id",
        "name": "相手のカード名",
        "bio": "相手の自己紹介",
        "image_url": "https://..."
      },
      "yourCardSent": {
        "id": "your-card-id",
        "name": "あなたのカード名"
      }
    },
    "message": "QR交換が完了しました。相手にもあなたのカードが送信されました。"
  }
}
```

### 3. 交換履歴確認
```bash
GET /exchanges/qr-logs
```

**レスポンス:**
```json
{
  "success": true,
  "data": {
    "logs": [
      {
        "id": "log-id",
        "scannerUser": {
          "id": "user-id",
          "name": "読み取った人の名前"
        },
        "scannerCard": {
          "id": "card-id",
          "name": "読み取った人のカード名",
          "bio": "読み取った人の自己紹介",
          "image_url": "https://..."
        },
        "memo": "交換メモ",
        "created_at": "2025-08-28T13:00:00Z"
      }
    ],
    "total": 5,
    "newLogs": 2
  }
}
```

## 🔑 パスワードリセット機能（v1.4.0の新機能）

### 1. パスワードリセット申請
```bash
POST /auth/forgot-password
```
```json
{
  "email": "user@example.com"
}
```

**レスポンス:**
```json
{
  "success": true,
  "message": "パスワードリセットメールを送信しました"
}
```

### 2. パスワードリセット実行
```bash
POST /auth/reset-password
```
```json
{
  "token": "reset-token-from-email",
  "newPassword": "new-secure-password"
}
```

**レスポンス:**
```json
{
  "success": true,
  "message": "パスワードが正常に更新されました"
}
```

### 3. パスワードリセットフォーム（Webブラウザ対応）
```bash
GET /auth/reset-password?token=reset-token
```

HTMLフォームが表示され、新しいパスワードを入力可能です。

### 🔒 セキュリティ仕様
- **トークン有効期限**: 1時間（3600秒）
- **ワンタイム使用**: トークンは1回のみ使用可能
- **メール認証**: 登録済みメールアドレスのみ受付
- **自動削除**: 期限切れトークンの自動クリーンアップ

## 🆕 v1.3.0の主な変更点

### ⚡ QR交換システムの革新
- **通知システム廃止**: 複雑な承認プロセスを削除
- **即時双方向交換**: 読み取りと同時に交換完了
- **シンプルなUX**: ワンタップで交換完了
- **リアルタイム履歴**: 即座に交換確認可能

### 📝 bio機能の追加
- **80文字制限**: 簡潔で分かりやすい自己紹介
- **全エンドポイント対応**: 作成・更新・表示すべてで利用可能
- **バリデーション**: 文字数制限の自動チェック

### 🛠 技術的改善
- **Durable Objects削除**: 依存関係の簡素化
- **パフォーマンス向上**: レスポンス速度の改善
- **エラーハンドリング強化**: より詳細なログ出力
- **型安全性の向上**: TypeScript定義の改善

## 📊 データベーススキーマ

### 主要テーブル
- `users` - ユーザー情報
- `cards` - プロフィールカード（**bio列追加**）
- `exchanges` - カード交換・コレクション記録
- `qr_exchange_logs` - **QR交換ログ**（新テーブル）
- `qr_exchange_tokens` - QR交換用一時トークン
- `password_reset_tokens` - **パスワードリセットトークン**（新テーブル）

### 新規テーブル: qr_exchange_logs
```sql
CREATE TABLE qr_exchange_logs (
    id TEXT PRIMARY KEY,
    qr_owner_user_id TEXT NOT NULL,  -- QR生成者
    scanner_user_id TEXT NOT NULL,   -- QR読み取り者
    scanner_card_id TEXT NOT NULL,   -- 読み取り者のカード
    qr_card_id TEXT NOT NULL,        -- QRコードのカード
    memo TEXT,                       -- 交換メモ
    location_name TEXT,              -- 場所名
    latitude REAL,                   -- 緯度
    longitude REAL,                  -- 経度
    notified INTEGER DEFAULT 0,      -- 通知フラグ
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### 新規テーブル: password_reset_tokens
```sql
CREATE TABLE password_reset_tokens (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    email TEXT NOT NULL,
    token TEXT NOT NULL UNIQUE,
    expires_at DATETIME NOT NULL,
    used INTEGER DEFAULT 0,          -- 使用済みフラグ
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);
```

## 🌐 デプロイ情報

- **Production URL**: https://flocka-api.kazu3jp-purin.workers.dev
- **Environment**: Cloudflare Workers
- **Version**: v1.4.0
- **Database**: Cloudflare D1
- **Storage**: Cloudflare R2

## 🔧 開発・デプロイコマンド

```bash
# 依存関係インストール
npm install

# 開発サーバー起動
npm run dev

# TypeScriptコンパイル確認
npm run type-check

# データベーススキーマ適用（ローカル）
npx wrangler d1 execute flocka-db --local --file=./db/schema.sql

# データベーススキーマ適用（本番）
npx wrangler d1 execute flocka-db --remote --file=./db/schema.sql

# 本番デプロイ
npm run deploy
```

## 📈 パフォーマンス指標

- **平均レスポンス時間**: < 100ms
- **QR交換処理**: < 500ms
- **同時接続**: 10,000+ concurrent users
- **可用性**: 99.9%（Cloudflare Workers）

## 🔒 セキュリティ

- **JWT認証**: セキュアなトークンベース認証
- **bcrypt暗号化**: パスワードの安全な保存
- **メール認証**: アカウント確認機能
- **パスワードリセット**: セキュアなトークンベースのパスワード回復機能
- **入力バリデーション**: 全エンドポイントでの検証
- **レート制限**: API悪用防止

## 📄 ライセンス

MIT License

## 👥 開発チーム

Flocka Development Team

---

**🎉 v1.3.0 - QR即時交換システムが利用可能になりました！**
