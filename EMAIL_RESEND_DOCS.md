# 📧 メール認証再送機能 - テスト例

## API エンドポイント

### 1. 認証済みユーザーによるメール再送
```bash
# JWT認証が必要
curl -X POST "http://localhost:8787/auth/resend-verification" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json"
```

**レスポンス例:**
```json
{
  "success": true,
  "message": "Verification email resent successfully",
  "data": {
    "email": "user@example.com",
    "message": "Please check your email for verification instructions"
  }
}
```

### 2. メールアドレス指定によるメール再送
```bash
# 認証不要（セキュリティ上、存在確認はしない）
curl -X POST "http://localhost:8787/auth/resend-verification-by-email" \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com"}'
```

**レスポンス例:**
```json
{
  "success": true,
  "message": "If the email exists in our system, a verification email has been sent"
}
```

## エラーパターン

### 1. 既にメール認証済み
```json
{
  "success": false,
  "error": "Email is already verified"
}
```

### 2. ユーザーが見つからない（認証済みの場合）
```json
{
  "success": false,
  "error": "User not found"
}
```

### 3. 認証トークンなし
```json
{
  "success": false,
  "error": "Authentication required"
}
```

## 使用シナリオ

1. **ユーザーがログイン後**: `/auth/resend-verification` を使用
2. **ログイン画面から**: `/auth/resend-verification-by-email` を使用
3. **セキュリティ**: メールアドレス指定版では、存在しないアドレスでも同じレスポンスを返す

## フロントエンド実装例

```typescript
// 認証済みユーザー用
const resendVerification = async () => {
  const token = localStorage.getItem('jwt_token');
  const response = await fetch('/auth/resend-verification', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });
  
  const result = await response.json();
  if (result.success) {
    alert('認証メールを再送しました');
  }
};

// メールアドレス指定用
const resendByEmail = async (email: string) => {
  const response = await fetch('/auth/resend-verification-by-email', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ email })
  });
  
  const result = await response.json();
  if (result.success) {
    alert('認証メールを送信しました（アドレスが存在する場合）');
  }
};
```
