# 🎴 Flocka API

デジタルプロフィールカード交換プラットフォームのバックエンドAPI

## 🌟 主な機能

### 📱 プロフィールカード作成・管理
- **デザインの自由度**: オリジナル画像アップロード対応
- **リッチな情報**: カード名、80文字bio、最大4つのSNS・ポートフォリオリンク
- **複数カード管理**: 用途別（ゲーム・創作・ビジネス等）の複数カード作成・切り替え

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
- `GET /me` - 現在のユーザー情報

### 🎴 カード管理 (`/cards`)
- `POST /upload-url` - 画像アップロード用署名付きURL生成
- `POST /upload-file` - 画像ファイル直接アップロード
- `GET /image/*` - 画像取得
- `POST /` - 新しいカード作成
- `GET /` - 自分のカード一覧
- `PUT /:id` - カード情報更新
- `DELETE /:id` - カード削除
- `POST /:id/generate-qr` - QRコード交換用データ生成
- `POST /:id/share` - カード共有URL生成
- `GET /public/:id` - 公開カード情報取得

### 🔄 交換・コレクション (`/exchanges`)
- `POST /` - カード交換してコレクションに追加
- `GET /` - 自分のコレクション一覧
- `PUT /:id` - コレクション情報更新
- `DELETE /:id` - コレクションから削除
- `GET /:id` - 特定の交換記録詳細

#### QRコード交換
- `POST /qr` - QRコードスキャンによる交換通知送信
- `GET /qr-notifications` - 受信したQR交換通知一覧
- `POST /qr-notifications/:id/respond` - QR交換通知への応答（承認/拒否）

#### URL交換
- `POST /mutual` - URL交換トークンを使った相互交換
- `GET /token-info` - 交換トークン情報取得

#### 近距離交換
- `POST /location/update` - 位置情報更新
- `POST /nearby` - 近くのユーザー検索
- `POST /request` - 交換リクエスト送信
- `GET /requests` - 受信した交換リクエスト取得
- `POST /requests/:id/respond` - 交換リクエストへの応答

### 🧹 システム管理 (`/cleanup`)
- `POST /expired-tokens` - 期限切れデータクリーンアップ
- `GET /stats` - クリーンアップ統計情報

## 📊 データベーススキーマ

### テーブル構成
```sql
users                        -- ユーザー情報
cards                        -- プロフィールカード
exchanges                    -- カード交換・コレクション記録
exchange_requests            -- 交換リクエスト（近距離交換用）
qr_exchange_tokens           -- QR交換用一時トークン
qr_exchange_notifications    -- QR交換通知（読み込まれた側への通知）
```

## ⚙️ セットアップ

### 前提条件
- Node.js 18+
- Cloudflare アカウント
- MailChannels API キー

### インストール
```bash
# リポジトリクローン
git clone https://github.com/kazu3jp/FlockaAPI.git
cd FlockaAPI

# 依存関係インストール
npm install

# Wranglerでログイン
npx wrangler login
```

### 環境設定
```bash
# wrangler.tomlの設定
cp wrangler.toml.example wrangler.toml

# 環境変数設定
npx wrangler secret put JWT_SECRET
npx wrangler secret put MAILCHANNELS_API_KEY
```

### データベース初期化
```bash
# D1データベース作成
npx wrangler d1 create flocka-db

# スキーマ適用
npm run db:generate
```

### 開発サーバー起動
```bash
npm run dev
```

## 🚢 デプロイ

### 本番デプロイ
```bash
# 本番環境にデプロイ
npm run deploy

# 本番データベース初期化
npx wrangler d1 execute flocka-db --file=./db/schema.sql --env production
```

### 環境別設定
```bash
# 開発環境
npm run dev

# ステージング
npm run deploy:staging

# 本番環境
npm run deploy:production
```

## 🔧 開発

### ローカル開発
```bash
# 開発サーバー（ホットリロード）
npm run dev

# 型チェック
npm run type-check

# ビルドテスト
npm run build
```

### データベース管理
```bash
# スキーマ生成
npm run db:generate

# マイグレーション適用
npm run db:migrate

# データベース確認
npx wrangler d1 execute flocka-db --command "SELECT * FROM users LIMIT 5;"
```

## 📋 API仕様

### レスポンス形式
```json
{
  "success": boolean,
  "data": any,      // 成功時のデータ
  "error": string,  // エラー時のメッセージ
  "message": string // 追加メッセージ（オプション）
}
```

### 認証
```bash
# ヘッダーに JWT トークンを含める
Authorization: Bearer <JWT_TOKEN>
```

### ファイルアップロード
- **対応形式**: JPEG, PNG, GIF, WebP
- **最大サイズ**: 10MB
- **ストレージ**: Cloudflare R2

## 🛡️ セキュリティ

### 認証・認可
- JWT による認証
- bcrypt によるパスワードハッシュ化
- メールアドレス確認必須

### データ保護
- CORS 設定による適切なオリジン制限
- SQL インジェクション対策
- XSS 対策

### トークン管理
- QRトークン: 30分有効
- 交換リクエスト: 30分有効
- 位置情報: 5分有効

## 🔍 モニタリング

### ログ
- Cloudflare Workers ログ
- エラートラッキング
- パフォーマンス監視

### メトリクス
- API レスポンス時間
- エラー率
- ユーザー登録数・アクティビティ

## 🤝 コントリビューション

### 開発フロー
1. Issue作成・確認
2. Feature ブランチ作成
3. 実装・テスト
4. Pull Request 作成
5. コードレビュー
6. マージ

### コーディング規約
- TypeScript strict mode
- ESLint + Prettier
- コミットメッセージ規約準拠

## 📝 ライセンス

MIT License

## 📞 サポート

- 📧 Email: support@flocka.net
- 🐛 Issues: [GitHub Issues](https://github.com/kazu3jp/FlockaAPI/issues)
- 📚 Docs: [API Documentation](https://api.flocka.net/docs)

---

**Flocka** - デジタル名刺交換の新しいスタンダード 🚀
│  (認証メール)     │                        │                │
└─────────────────┘                        └─────────────────┘
```

## 技術スタック

### ランタイム・フレームワーク
- **Cloudflare Workers**: エッジコンピューティング環境
- **Hono**: 軽量TypeScriptウェブフレームワーク
- **TypeScript**: 型安全な開発

### データ・ストレージ
- **Cloudflare D1**: SQLiteベースのサーバーレスデータベース
- **Cloudflare R2**: オブジェクトストレージ（S3互換）

### 認証・セキュリティ
- **JWT (JSON Web Tokens)**: セッション管理
- **bcryptjs**: パスワードハッシュ化
- **Zod**: スキーマバリデーション

### 外部サービス
- **MailChannels Email API**: トランザクションメール送信

## データベーススキーマ

### users テーブル

```sql
- id (TEXT, PRIMARY KEY): ユーザー一意識別子
- email (TEXT, UNIQUE): メールアドレス
- name (TEXT): ユーザー名
- hashed_password (TEXT): ハッシュ化パスワード
- email_verified (INTEGER): メール認証状態
- created_at (DATETIME): 作成日時
```

### cards テーブル

```sql
- id (TEXT, PRIMARY KEY): カード一意識別子
- user_id (TEXT): 所有ユーザーID
- card_name (TEXT): カード名
- bio (TEXT): 自己紹介（80文字制限）
- image_key (TEXT): R2ストレージ内画像キー
- links (TEXT): JSON形式のリンク情報
- created_at (DATETIME): 作成日時
```

### exchanges テーブル

```sql
- id (TEXT, PRIMARY KEY): 交換記録一意識別子
- owner_user_id (TEXT): コレクションユーザーID
- collected_card_id (TEXT): コレクションされたカードID
- memo (TEXT): 個人メモ
- location_name (TEXT): 交換場所名
- latitude (REAL): 緯度
- longitude (REAL): 経度
- created_at (DATETIME): 交換日時
```

## API エンドポイント

### 認証・アカウント管理 (`/auth`)

#### `POST /auth/register`
新規ユーザー登録
```json
{
  "email": "user@example.com",
  "name": "ユーザー名",
  "password": "password123"
}
```

#### `POST /auth/login`
ユーザーログイン
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

#### `POST /auth/verify-email`
メールアドレス認証
```json
{
  "token": "verification_token"
}
```

#### `GET /users/me`
現在のユーザー情報取得（要認証）

#### `DELETE /users/me`
ユーザーアカウント削除（要認証）

### プロフィールカード管理 (`/cards`)

#### `POST /cards/upload-url`
画像アップロード用事前チェック（要認証）
```json
{
  "fileName": "profile.jpg",
  "fileSize": 1024000,
  "contentType": "image/jpeg"
}
```

#### `POST /cards/upload`
画像ファイルを直接アップロード（要認証）
- multipart/form-data形式
- ファイルサイズ制限: 10MB
- 対応形式: JPEG, PNG, GIF, WebP

#### `GET /cards/image/*`
アップロード済み画像を取得（公開）
- 高速CDN配信
- 1年間ブラウザキャッシュ

#### `POST /cards`
新しいプロフィールカード作成（要認証）
```json
{
  "card_name": "エンジニア交流会用",
  "bio": "フロントエンドエンジニア。React/TypeScript/Next.js使いです！",
  "image_key": "uploaded-image-key",
  "links": [
    {
      "title": "Twitter",
      "url": "https://twitter.com/username"
    },
    {
      "title": "GitHub", 
      "url": "https://github.com/username"
    },
    {
      "title": "Portfolio",
      "url": "https://myportfolio.dev"
    },
    {
      "title": "lit.link",
      "url": "https://lit.link/username"
    }
  ]
}
```

**特徴**:
- 複数カード作成対応（界隈ごとにカード分類可能）
- 80文字以内の自己紹介文対応
- 最大4つまでのURL情報を紐付け可能
- カスタム画像でオリジナルデザイン作成

#### `GET /cards`
自分が作成したカード一覧取得（要認証）

**レスポンス例**:
```json
{
  "success": true,
  "data": [
    {
      "id": "card1",
      "card_name": "ゲーム用",
      "bio": "ゲーム好きです！FPSやRPGをよくプレイしています",
      "image_key": "cards/user123/game-card.jpg",
      "links": [...],
      "created_at": "2025-08-28T10:00:00Z"
    },
    {
      "id": "card2", 
      "card_name": "創作活動用",
      "bio": "イラストレーター。デジタルアート中心に活動中",
      "image_key": "cards/user123/creative-card.jpg", 
      "links": [...],
      "created_at": "2025-08-28T11:00:00Z"
    }
  ]
}
```

#### `PUT /cards/:id`
カード情報更新（要認証）

#### `DELETE /cards/:id`
カード削除（要認証）

### カード交換・コレクション (`/exchanges`)

#### `POST /exchanges`
カードをコレクションに追加（要認証）
```json
{
  "collected_card_id": "target-card-id",
  "memo": "Tech Conference 2025で交換",
  "location_name": "東京ビッグサイト",
  "latitude": 35.629971,
  "longitude": 139.793625
}
```

**コレクション機能**:
- 交換した相手のカードをアプリ内でコレクション
- 交換した日付や場所を自動記録
- イベント名などのカスタムメモを追加可能

#### `GET /exchanges`
自分のコレクション一覧取得（要認証）

**レスポンス例**:
```json
{
  "success": true,
  "data": [
    {
      "id": "exchange123",
      "collected_card_id": "card456",
      "memo": "Tech Conference 2025で交換",
      "location_name": "東京ビッグサイト",
      "latitude": 35.629971,
      "longitude": 139.793625,
      "created_at": "2025-08-28T14:30:00Z",
      "card": {
        "id": "card456",
        "name": "エンジニア太郎",
        "image_key": "cards/user789/profile.jpg",
        "creator": {
          "name": "田中太郎",
          "email": "tanaka@example.com"
        }
      }
    }
  ]
}
```

#### `GET /exchanges/:id`
特定のコレクション詳細取得（要認証）

#### `PUT /exchanges/:id`
コレクション情報更新（要認証）
```json
{
  "memo": "懇親会でも話しました！",
  "location_name": "渋谷のカフェ",
  "latitude": 35.659488,
  "longitude": 139.700649
}
```

#### `DELETE /exchanges/:id`
コレクションから削除（要認証）

### QRコード交換機能 (`/cards` & `/exchanges`)

#### `POST /cards/:id/generate-qr`
カード交換用のQRコードデータを生成（要認証）
```json
{
  "expiresIn": 3600
}
```

**QRコード交換の流れ**:
1. 交換したいカードを選択
2. QRコードデータを生成（デフォルト1時間有効）
3. 画面にQRコードを表示
4. 相手にスキャンしてもらう
5. スキャンした側は交換通知を送信
6. QR生成者が通知を確認して承認/拒否

レスポンス：
```json
{
  "success": true,
  "data": {
    "qrData": "flocka://exchange?t=eyJjaWQiOi...",
    "qrToken": "eyJjaWQiOi...",
    "cardId": "card-id",
    "cardName": "エンジニア交流会用",
    "expiresAt": "2025-08-28T15:30:00.000Z",
    "expiresIn": 3600
  }
}
```

#### `POST /exchanges/qr`
QRコードスキャンによる交換通知送信（要認証）
```json
{
  "qrData": "flocka://exchange?t=eyJjaWQiOi...",
  "myCardId": "my-card-id",
  "memo": "Tech Meetupで交換希望",
  "location_name": "渋谷オフィス",
  "latitude": 35.659488,
  "longitude": 139.700649
}
```

**レスポンス**:
```json
{
  "success": true,
  "message": "Exchange notification sent successfully",
  "data": {
    "notificationId": "notification-id",
    "targetUser": "qr-owner-user-id",
    "yourCard": {
      "id": "my-card-id",
      "name": "私のカード"
    },
    "targetCard": {
      "id": "target-card-id",
      "name": "相手のカード"
    },
    "message": "QRコード生成者に交換通知を送信しました。相手の承認をお待ちください。"
  }
}
```

#### `GET /exchanges/qr-notifications`
受信したQR交換通知一覧取得（要認証）

**レスポンス**:
```json
{
  "success": true,
  "data": [
    {
      "id": "notification-id",
      "scannerUser": {
        "id": "scanner-user-id",
        "name": "スキャンしたユーザー"
      },
      "scannerCard": {
        "id": "scanner-card-id",
        "name": "スキャンしたユーザーのカード",
        "bio": "フロントエンドエンジニアです"
      },
      "yourCard": {
        "id": "your-card-id",
        "name": "あなたのカード"
      },
      "memo": "Tech Meetupで交換希望",
      "location": {
        "name": "渋谷オフィス",
        "latitude": 35.659488,
        "longitude": 139.700649
      },
      "status": "pending",
      "createdAt": "2025-08-28T10:30:00.000Z"
    }
  ]
}
```

#### `POST /exchanges/qr-notifications/:id/respond`
QR交換通知への応答（要認証）

**承認の場合**:
```json
{
  "action": "accept",
  "myCardId": "my-card-for-exchange"
}
```

**拒否の場合**:
```json
{
  "action": "reject"
}
```

**特徴**:
- 相手のQRコードをスキャンして自動交換
- 双方のコレクションに相手のカードが追加
- 交換場所・メモを記録可能
- リアルタイム交換に最適化

#### `GET /exchanges/qr-info`
QRトークンの情報を取得（要認証）
```
GET /exchanges/qr-info?qrData=flocka://exchange?t=eyJjaWQiOi...
```

### URL交換機能 (`/cards` & `/exchanges`)

#### `POST /cards/:id/generate-exchange-url`
カード交換用のURLを生成（要認証）

**URL交換の特徴**:
- AirDropやSNSのDMで簡単共有
- 24時間の長期間有効
- ブラウザ経由でのアクセス対応

#### `POST /exchanges/mutual`
URLトークンを使った相互カード交換（要認証）

#### `GET /exchanges/token-info`
交換トークンの情報を取得（要認証）

#### `GET /cards/exchange`
ブラウザからの交換ページ（認証不要）

**QRコード vs URL交換の使い分け**:

| 機能 | QRコード交換 | URL交換 |
|-----|-------------|---------|
| **使用場面** | リアルタイム対面交換 | オンライン・遠隔交換 |
| **有効期限** | 短時間（1時間） | 長時間（24時間） |
| **共有方法** | QRスキャン | URL共有 |
| **利便性** | 瞬時交換 | 非同期交換 |

## 実装状況

### ✅ 完全実装済み機能

1. **① プロフィールカード作成・管理機能**
   - ✅ 画像アップロード（R2ストレージ）
   - ✅ カード作成・更新・削除
   - ✅ 複数カード管理
   - ✅ URL情報紐付け（最大4つ）
   - ✅ カード名による分類

2. **③ 多彩な交換方法**
   - ✅ QRコード交換（リアルタイム）
   - ✅ URL共有交換（非同期）
   - ✅ 交換場所記録（位置情報）
   - ⏳ 近距離交換 (BLE) - フロントエンド実装

3. **④ コレクション機能**
   - ✅ 交換したカードのコレクション
   - ✅ 交換日付・場所の記録
   - ✅ カスタムメモ機能
   - ✅ コレクション管理（更新・削除）

4. **セキュリティ・認証**
   - ✅ ユーザー登録・ログイン
   - ✅ メール認証
   - ✅ JWT認証
   - ✅ パスワードハッシュ化

### ⏳ フロントエンド実装が必要な機能

- **② 直感的なカード切り替え機能** - スワイプ操作
- **近距離交換 (BLE)** - Bluetooth Low Energy機能

## セキュリティ機能

- **パスワードハッシュ化**: bcryptによる強力なハッシュ化
- **JWT認証**: Bearer tokenによる認証
- **メール認証**: MailChannelsによる認証メール送信
- **CORS対応**: フロントエンドとの連携

## 場所情報機能

カード交換時に以下の情報を記録できます：

- **location_name**: 交換場所の名前（例: "東京ビッグサイト"）
- **latitude/longitude**: 交換場所の緯度・経度
- **memo**: 個人的なメモ

これらの情報は後から`PUT /exchanges/:id`で更新可能です。

## 開発者向け情報

### プロジェクト構造

```
src/
├── index.ts           # メインアプリケーション
├── types/             # TypeScript型定義
├── utils/             # ユーティリティ関数
│   ├── auth.ts        # 認証関連
│   └── email.ts       # メール送信
├── middleware/        # ミドルウェア
│   └── auth.ts        # 認証・CORS・エラーハンドリング
└── routes/            # APIルート
    ├── auth.ts        # 認証エンドポイント
    ├── cards.ts       # カード管理エンドポイント
    └── exchanges.ts   # 交換管理エンドポイント
```

### 主要な実装ポイント

1. **セキュアなパスワード管理**: bcryptによるハッシュ化とソルティング
2. **JWT認証**: 7日間有効なトークン
3. **メール認証**: 24時間有効な認証トークン
4. **場所情報**: 緯度・経度による正確な位置記録
5. **R2連携**: 画像ファイルの安全な保存
6. **画像処理**: 自動リサイズ・形式変換・CDN配信

## セットアップ

### 前提条件
- Node.js 18以上
- Cloudflareアカウント
- Wrangler CLI

### インストール

1. **依存関係インストール**
```bash
npm install
```

2. **Cloudflareリソース作成**
```bash
# D1データベース作成
wrangler d1 create flocka-db

# R2バケット作成
wrangler r2 bucket create flocka-storage
```

3. **データベーススキーマ適用**
```bash
npm run db:generate
```

4. **環境変数設定**
`wrangler.toml`を編集して設定：
- `JWT_SECRET`: JWT署名用秘密鍵
- `MAILCHANNELS_API_KEY`: MailChannels APIキー

5. **デプロイ**
```bash
npm run deploy
```

### ローカル開発

```bash
npm run dev
```
http://localhost:8787 でAPIが利用可能

## デプロイ済みAPI

- **URL**: https://flocka-api.kazu3jp-purin.workers.dev
- **バージョン**: 1.2.0
- **ステータス**: 🟢 運用中

## 📝 更新履歴

### v1.2.0 (2025-08-28)
- ✨ **新機能**: QR交換通知システム
  - QRコード読み込み時に即座に交換せず、読み込まれた側に通知を送信
  - 読み込まれた側が通知を確認して承認/拒否を選択可能
  - 読み込んだ側のカード情報・メモ・位置情報を通知で確認
- 🗃️ **データベース**: qr_exchange_notificationsテーブル追加
- 🔄 **API**: QR交換関連エンドポイントを大幅改善
  - `POST /exchanges/qr` - 交換通知送信
  - `GET /exchanges/qr-notifications` - 通知一覧取得
  - `POST /exchanges/qr-notifications/:id/respond` - 通知応答

### v1.1.0 (2025-08-28)
- ✨ **新機能**: カードにbio（自己紹介）フィールドを追加
  - 80文字制限の自己紹介文をカードに設定可能
  - カード作成・更新・表示の全エンドポイントで対応
  - HTML表示でもbioを表示
- 🗃️ **データベース**: cardsテーブルにbioカラム追加
- 🔧 **バリデーション**: bio用のバリデーション関数追加

### v1.0.0 (2025-08-27)
- 🎉 **初回リリース**: 基本的なデジタル名刺交換機能
  - ユーザー認証（JWT）
  - カード作成・管理
  - QRコード・URL・近距離交換
  - 画像アップロード（Cloudflare R2）
  - 匿名ユーザー対応

## ライセンス

MIT License

---

*Flocka API v1.2.0 - デジタルプロフィールカード交換プラットフォーム*
