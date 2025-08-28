# Flocka API 概要

## 主な機能

### プロフィールカード作成・管理機能
- **デザインの自由度**: ユーザーが好きな画像をアップロードし、オリジナルのカードを作成
- **情報紐付け**: カード名、bio、最大4つのURL情報（X, Instagram, lit.link, GitHub, ポートフォリオサイト等）
- **複数カード管理**: 界隈ごとに複数のカードを作成・保存

### 多彩な交換方法
- **QRコード**: カード専用QRコードを生成・読み取りで相互交換
- **URL共有**: カード専用URLをAirDropやSNSで共有
- **近距離交換 (BLE)**: アプリ内で近くのユーザーを検出し、リクエスト送信で交換

### コレクション機能
- 交換したカードをアプリ内にコレクション
- 交換した場所情報の記録
- 日付やイベント名などをメモとして記録

## API エンドポイント

### 認証 (`/auth`)

- `POST /auth/register` - 新規ユーザー登録
- `POST /auth/login` - ログイン
- `GET /auth/verify` - メールアドレス確認
- `POST /auth/resend-verification` - メール認証再送（要認証）
- `POST /auth/resend-verification-by-email` - メール認証再送（メールアドレス指定）
- `GET /users/me` - 現在のユーザー情報取得

### カード管理 (`/cards`)
- `POST /cards/upload-url` - 画像アップロード用署名付きURL生成
- `POST /cards/upload-file` - 画像ファイル直接アップロード
- `GET /cards/image/*` - 画像取得
- `POST /cards` - 新しいカード作成
- `GET /cards` - 自分のカード一覧取得
- `PUT /cards/:id` - カード情報更新
- `DELETE /cards/:id` - カード削除
- `POST /cards/:id/generate-qr` - QRコード交換用データ生成
- `POST /cards/:id/share` - カード共有URL生成
- `GET /cards/public/:id` - 公開カード情報取得
- `POST /cards/:id/generate-exchange-url` - 交換用URL生成（レガシー）
- `GET /cards/exchange` - 交換用URLアクセス処理

### 交換・コレクション (`/exchanges`)
- `POST /exchanges` - カード交換してコレクションに追加
- `GET /exchanges` - 自分のコレクション一覧取得
- `PUT /exchanges/:id` - コレクション情報更新
- `DELETE /exchanges/:id` - コレクションから削除
- `GET /exchanges/:id` - 特定の交換記録詳細取得

#### QRコード交換
- `POST /exchanges/qr` - QRコードスキャンによる交換

#### URL交換
- `POST /exchanges/mutual` - URL交換トークンを使った相互交換
- `GET /exchanges/token-info` - 交換トークン情報取得

#### 近距離交換（アプリで完結）
- `POST /exchanges/request` - 交換リクエスト送信
- `GET /exchanges/requests` - 受信した交換リクエスト取得
- `POST /exchanges/requests/:id/respond` - 交換リクエストへの応答

### システム管理 (`/cleanup`)
- `POST /cleanup/expired-tokens` - 期限切れデータクリーンアップ
- `GET /cleanup/stats` - クリーンアップ統計情報取得

## データベーススキーマ

### テーブル
- `users` - ユーザー情報
- `cards` - プロフィールカード
- `exchanges` - カード交換・コレクション記録
- `exchange_requests` - 交換リクエスト（近距離交換用）
- `qr_exchange_tokens` - QR交換用一時トークン

## 技術仕様

### 認証
- JWT認証
- メールアドレス確認機能

### ファイルストレージ
- Cloudflare R2での画像管理
- 対応形式: JPEG, PNG, GIF, WebP
- 最大ファイルサイズ: 10MB

### セキュリティ
- QRトークン: 30分有効
- 交換リクエスト: 30分有効
- 位置情報記録: アプリで管理（API側は記録のみ）

## エラーハンドリング

すべてのAPIレスポンスは以下の形式：
```json
{
  "success": boolean,
  "data": any, // 成功時
  "error": string, // エラー時
  "message": string // オプショナル
}
```

## CORS設定
- 開発環境: `localhost:*`
- 本番環境: `flocka.net`, `*.flocka.net`

## 使用技術
- **フレームワーク**: Hono.js
- **ランタイム**: Cloudflare Workers
- **データベース**: Cloudflare D1 (SQLite)
- **ストレージ**: Cloudflare R2
- **メール**: MailChannels API

## 実装された機能

### ✅ 完了済み
- ユーザー認証（登録・ログイン・メール確認）
- プロフィールカード作成・編集・削除
- 画像アップロード・管理
- QRコード交換システム
- URL共有システム
- 近距離交換システム
- コレクション管理
- 位置情報記録
- 自動期限切れ処理

### 🔧 リファクタリング済み
- utilsディレクトリの構造改善
- バリデーション関数の分離
- QRコード処理の専用ユーティリティ
- 位置情報処理の専用ユーティリティ
- 画像処理の専用ユーティリティ
- 簡素化されたメール処理

### 📱 アプリ連携対応
- 専用URLスキーマ対応（`flockaapp://`）
- 自動アプリ起動機能
- フォールバック対応
