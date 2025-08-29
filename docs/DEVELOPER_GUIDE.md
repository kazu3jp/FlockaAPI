# 🛠️ Flocka API 開発者ガイド

## 📱 カードリンク詳細取得

### 利用可能なエンドポイント

#### 自分のカード詳細取得（認証必要）
```bash
GET /cards/:cardId
Authorization: Bearer <JWT_TOKEN>
```

#### 公開カード詳細取得（認証不要）
```bash
GET /cards/public/:cardId
```

### レスポンス形式
```json
{
  "success": true,
  "data": {
    "id": "card-unique-id",
    "card_name": "表示名",
    "image_url": "/cards/image/path/to/image.jpg",
    "owner_name": "所有者名",
    "bio": "自己紹介文（80文字以内）",
    "links": [
      {
        "title": "Twitter",
        "url": "https://twitter.com/username"
      },
      {
        "title": "Instagram", 
        "url": "https://instagram.com/username"
      }
    ],
    "created_at": "2025-08-28T12:00:00Z"
  }
}
```

## 🔧 SNSリンクの仕様

- **配列形式**: 最大4つのリンクオブジェクト
- **各リンクオブジェクト**:
  - `title`: 表示名（最大50文字）
  - `url`: 有効なURL形式

## 📝 実装例

### JavaScript/TypeScript
```typescript
const getCardDetails = async (cardId: string, token: string) => {
  const response = await fetch(`/cards/${cardId}`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });
  
  const result = await response.json();
  if (result.success) {
    const { links, image_url, card_name, bio } = result.data;
    return result.data;
  }
};
```

### cURLテスト例
```bash
### cURLテスト例

```bash
# 公開カード詳細取得
curl -X GET "https://flocka-api.kazu3jp-purin.workers.dev/cards/public/CARD_ID" 
  -H "Content-Type: application/json"

# コレクションメモ更新
curl -X PUT "https://flocka-api.kazu3jp-purin.workers.dev/exchanges/EXCHANGE_ID" 
  -H "Authorization: Bearer YOUR_JWT_TOKEN" 
  -H "Content-Type: application/json" 
  -d '{
    "memo": "イベントで交換した思い出のカード",
    "location_name": "東京ビッグサイト",
    "latitude": 35.6295,
    "longitude": 139.7937
  }'

# コレクション詳細取得
curl -X GET "https://flocka-api.kazu3jp-purin.workers.dev/exchanges/EXCHANGE_ID" 
  -H "Authorization: Bearer YOUR_JWT_TOKEN" 
  -H "Content-Type: application/json"
```

## 📝 コレクション管理

### メモ更新例

```typescript
const updateCollectionMemo = async (exchangeId: string, memo: string, token: string) => {
  const response = await fetch(`/exchanges/${exchangeId}`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      memo,
      location_name: '新しい場所名', // オプション
      latitude: 35.6762,            // オプション
      longitude: 139.6503           // オプション
    })
  });
  
  const result = await response.json();
  if (result.success) {
    console.log('メモが更新されました:', result.data);
    return result.data;
  }
};
```
```

---

詳細な開発者向け情報については、メインのREADME.mdをご参照ください。
