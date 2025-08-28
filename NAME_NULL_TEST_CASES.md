# 🧪 アカウントname null許容のテストケース

## 📋 テスト項目

### 1. ユーザー登録テスト

#### ケース1: 名前ありでの登録
```bash
curl -X POST "http://localhost:8787/auth/register" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test1@example.com",
    "name": "テストユーザー1",
    "password": "password123"
  }'
```

**期待値**: 正常登録、nameフィールドに値設定

#### ケース2: 名前なしでの登録
```bash
curl -X POST "http://localhost:8787/auth/register" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test2@example.com", 
    "password": "password123"
  }'
```

**期待値**: 正常登録、nameフィールドはnull

#### ケース3: 空文字列nameでの登録
```bash
curl -X POST "http://localhost:8787/auth/register" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test3@example.com",
    "name": "",
    "password": "password123"
  }'
```

**期待値**: バリデーションエラー

#### ケース4: 長すぎるnameでの登録
```bash
curl -X POST "http://localhost:8787/auth/register" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test4@example.com",
    "name": "'$(python3 -c "print('a' * 101)")'",
    "password": "password123"
  }'
```

**期待値**: バリデーションエラー（100文字超過）

### 2. 表示テスト

#### ケース5: カード作成と公開表示
```bash
# 名前なしユーザーでログイン
curl -X POST "http://localhost:8787/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test2@example.com",
    "password": "password123"
  }'

# レスポンスのtokenを使用してカード作成
curl -X POST "http://localhost:8787/cards" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "card_name": "匿名ユーザーのカード",
    "links": [
      {"title": "Website", "url": "https://example.com"}
    ]
  }'

# 公開カード表示（匿名ユーザー表示確認）
curl -X GET "http://localhost:8787/cards/public/CARD_ID"
```

**期待値**: `owner_name`が「匿名ユーザー」として表示

#### ケース6: 交換リクエスト表示
```bash
# 交換リクエスト一覧取得
curl -X GET "http://localhost:8787/exchanges/requests" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**期待値**: `fromUser.name`がnullの場合「匿名ユーザー」として表示

### 3. データベース確認

#### 実際のデータベース状態確認
```bash
# ローカルD1での確認
npx wrangler d1 execute flocka-db --command "SELECT id, email, name, created_at FROM users ORDER BY created_at DESC LIMIT 5;"

# 本番D1での確認  
npx wrangler d1 execute flocka-db --command "SELECT id, email, name, created_at FROM users ORDER BY created_at DESC LIMIT 5;" --remote
```

**期待値**: nameフィールドにnull値が適切に保存されている

## ✅ 検証ポイント

### 1. **登録処理**
- [ ] nameありでの正常登録
- [ ] nameなしでの正常登録  
- [ ] 不正なnameでのバリデーションエラー
- [ ] データベースへの適切な保存

### 2. **表示処理**
- [ ] 名前ありユーザーの正常表示
- [ ] 名前なしユーザーの「匿名ユーザー」表示
- [ ] HTMLテンプレートでの適切な表示
- [ ] JSONレスポンスでの適切な処理

### 3. **API一貫性**
- [ ] 既存エンドポイントの動作維持
- [ ] レスポンス形式の互換性
- [ ] エラーハンドリングの一貫性

### 4. **セキュリティ**
- [ ] null injection攻撃への対策
- [ ] XSS対策（表示部分）
- [ ] バリデーション迂回の防止

## 🔧 デバッグ用コマンド

### データベース直接確認
```bash
# ユーザーテーブルの構造確認
npx wrangler d1 execute flocka-db --command "PRAGMA table_info(users);"

# nameがnullのユーザー確認
npx wrangler d1 execute flocka-db --command "SELECT * FROM users WHERE name IS NULL;"

# nameがある/ないユーザーの数
npx wrangler d1 execute flocka-db --command "SELECT 
  COUNT(CASE WHEN name IS NOT NULL THEN 1 END) as named_users,
  COUNT(CASE WHEN name IS NULL THEN 1 END) as anonymous_users
FROM users;"
```

### ログ確認
```bash
# Cloudflare Workers ログ確認
npx wrangler tail --format pretty

# 特定のリクエストのデバッグ
npx wrangler tail --grep "register\|auth"
```

## 📊 成功基準

1. **機能性**: 全てのテストケースが期待通りに動作
2. **パフォーマンス**: 既存機能への影響なし
3. **セキュリティ**: バリデーション適切に動作
4. **UX**: 匿名ユーザーが適切に表示される
5. **互換性**: 既存データとの後方互換性維持

この変更により、FlockaAPIはより柔軟でプライバシーを考慮したユーザー登録が可能になります！
