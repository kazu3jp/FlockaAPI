# 📝 アカウントnameフィールドのnull許容対応

## 🔄 変更概要

ユーザーアカウントの`name`フィールドをnull許容（オプション）に変更し、より柔軟なユーザー登録を可能にしました。

## 🗄️ データベーススキーマ変更

### Before
```sql
CREATE TABLE users (
    name TEXT NOT NULL,
    -- その他のフィールド
);
```

### After
```sql
CREATE TABLE users (
    name TEXT, -- null許容に変更
    -- その他のフィールド
);
```

## 📋 型定義の更新

### User Interface
```typescript
// Before
export interface User {
  name: string;
  // その他のフィールド
}

// After
export interface User {
  name?: string; // オプショナルに変更
  // その他のフィールド
}
```

### RegisterRequest Interface
```typescript
// Before
export interface RegisterRequest {
  name: string;
  // その他のフィールド
}

// After
export interface RegisterRequest {
  name?: string; // オプショナルに変更
  // その他のフィールド
}
```

## 🔧 API変更点

### 1. ユーザー登録 (`POST /auth/register`)

#### リクエスト
```json
{
  "email": "user@example.com",
  "name": "山田太郎", // オプション
  "password": "securepassword"
}
```

#### nameなしでの登録も可能
```json
{
  "email": "user@example.com",
  "password": "securepassword"
}
```

### 2. バリデーション追加

新しい`validateUserName()`関数を追加：
```typescript
export function validateUserName(name?: string): boolean {
  if (name === undefined || name === null) return true; // オプション
  return (
    typeof name === 'string' &&
    name.trim().length > 0 &&
    name.length <= 100
  );
}
```

## 🎨 表示の改善

nameがnullの場合の表示対応：

### 1. カード表示
```typescript
// Before
creator: { name: user.name }

// After  
creator: { name: user.name || '匿名ユーザー' }
```

### 2. 交換リクエスト表示
```typescript
// Before
fromUser: { name: request.from_user_name }

// After
fromUser: { name: request.from_user_name || '匿名ユーザー' }
```

### 3. HTMLテンプレート
```html
<!-- Before -->
<div class="owner-name">by ${card.owner_name}</div>

<!-- After -->
<div class="owner-name">by ${card.owner_name || '匿名ユーザー'}</div>
```

## 📱 使用例

### ユーザー登録パターン

#### 1. 名前ありでの登録
```bash
curl -X POST "https://api.flocka.net/auth/register" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "name": "山田太郎",
    "password": "securepassword"
  }'
```

#### 2. 名前なしでの登録
```bash
curl -X POST "https://api.flocka.net/auth/register" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com", 
    "password": "securepassword"
  }'
```

## 🔒 後方互換性

- 既存のユーザーデータは影響なし
- nameが設定されているユーザーは従来通り表示
- nameがnullのユーザーは「匿名ユーザー」として表示
- APIエンドポイントの変更なし

## 💡 メリット

### 1. **柔軟な登録プロセス**
- 実名を入力したくないユーザーにも対応
- メールアドレスとパスワードのみでの簡単登録

### 2. **プライバシー保護**
- 匿名でのサービス利用が可能
- 後からプロフィール設定でnameを追加可能

### 3. **国際化対応**
- 文化的に実名を避ける傾向がある地域でも利用しやすい
- ビジネスカードでもペルソナ名での利用が可能

## 🚀 今後の拡張可能性

### 1. **プロフィール編集機能**
```typescript
// 将来的な実装例
PUT /auth/profile
{
  "name": "新しい名前"
}
```

### 2. **表示名のカスタマイズ**
```typescript
// displayNameフィールドの追加検討
{
  "name": null,
  "displayName": "クリエイターA",
  "email": "user@example.com"
}
```

### 3. **匿名表示のカスタマイズ**
```typescript
// 設定可能な匿名表示名
{
  "name": null,
  "anonymousDisplayName": "神秘の交換者"
}
```

この変更により、FlockaAPIはより包括的で使いやすいプラットフォームになりました！
