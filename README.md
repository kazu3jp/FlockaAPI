# Flocka API

デジタルプロフィールカード交換アプリのバックエンドAPI

## 概要

FlockaはCloudflare Workers上で動作するTypeScript製のRESTful APIです。ユーザーが独自のデジタルプロフィールカードを作成し、イベントや集まりで他のユーザーとカードを交換・コレクションできるアプリケーションのバックエンドサービスです。交換したカードには、場所情報（位置・場所名）と個人的なメモを記録できる機能を提供します。

## 特徴

- 🚀 **高速**: Cloudflare Workers のエッジランタイムで動作
- 🔒 **セキュア**: JWT認証、bcryptパスワードハッシュ化、メール認証
- 📍 **位置情報**: カード交換時の詳細な場所情報を記録
- 📧 **メール認証**: MailChannels Email APIによる信頼性の高い認証メール送信
- 💾 **スケーラブル**: Cloudflare D1 SQLiteデータベース
- 🗂️ **ファイルストレージ**: Cloudflare R2オブジェクトストレージ
- 🛡️ **バリデーション**: Zodスキーマによる厳密な入力検証
- 📚 **型安全**: TypeScriptによる完全な型安全性

## アーキテクチャ

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Cloudflare    │    │   Cloudflare    │    │   Cloudflare    │
│     Workers     │    │   D1 Database   │    │   R2 Storage    │
│   (Hono API)    │◄──►│   (SQLite)      │    │  (画像ファイル)   │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         ▲                                              ▲
         │                                              │
         ▼                                              ▼
┌─────────────────┐                        ┌─────────────────┐
│  MailChannels   │                        │   フロントエンド  │
│   Email API     │                        │   アプリケーション │
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
画像アップロード用署名URL取得（要認証）
```json
{
  "fileName": "profile.jpg",
  "fileSize": 1024000
}
```

#### `POST /cards`
新しいカード作成（要認証）
```json
{
  "cardName": "カード名",
  "imageKey": "uploaded-image-key",
  "links": [
    {
      "type": "twitter",
      "label": "Twitter",
      "url": "https://twitter.com/username"
    }
  ]
}
```

#### `GET /cards`
ユーザーのカード一覧取得（要認証）

#### `PUT /cards/:id`
カード情報更新（要認証）

#### `DELETE /cards/:id`
カード削除（要認証）

### カード交換・コレクション (`/exchanges`)

#### `POST /exchanges`
カードをコレクションに追加（要認証）
```json
{
  "cardId": "card-id",
  "memo": "イベントで交換",
  "locationName": "東京ビッグサイト",
  "latitude": 35.629971,
  "longitude": 139.793625
}
```

#### `GET /exchanges`
コレクション一覧取得（要認証）

#### `GET /exchanges/:id`
特定のコレクション詳細取得（要認証）

#### `PUT /exchanges/:id`
コレクション情報更新（要認証）
```json
{
  "memo": "更新されたメモ",
  "locationName": "新しい場所名",
  "latitude": 35.629971,
  "longitude": 139.793625
}
```

#### `DELETE /exchanges/:id`
コレクションから削除（要認証）

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
