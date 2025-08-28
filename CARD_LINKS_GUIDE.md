# 📱 カードのSNSリンク詳細取得 - API使用ガイド

## 🔍 利用可能なエンドポイント

### 1. 自分のカード詳細取得（認証必要）
```bash
GET /cards/:cardId
Authorization: Bearer <JWT_TOKEN>
```

### 2. 公開カード詳細取得（認証不要）
```bash
GET /cards/public/:cardId
```

### 3. 全カード一覧取得（認証必要）
```bash
GET /cards
Authorization: Bearer <JWT_TOKEN>
```

## 📊 レスポンス形式

### カード詳細情報の構造
```json
{
  "success": true,
  "data": {
    "id": "card-unique-id",
    "card_name": "表示名",
    "image_url": "/cards/image/path/to/image.jpg",
    "owner_name": "所有者名",
    "links": [
      {
        "title": "Twitter",
        "url": "https://twitter.com/username"
      },
      {
        "title": "Instagram", 
        "url": "https://instagram.com/username"
      },
      {
        "title": "LinkedIn",
        "url": "https://linkedin.com/in/username"
      },
      {
        "title": "Website",
        "url": "https://example.com"
      }
    ],
    "created_at": "2025-08-28T12:00:00Z"
  }
}
```

## 🔧 SNSリンクの仕様

### サポートされるリンク形式
- **配列形式**: 最大4つのリンクオブジェクト
- **各リンクオブジェクト**:
  - `title`: 表示名（最大50文字）
  - `url`: 有効なURL形式

### 一般的なSNSリンクパターン
```json
{
  "links": [
    {
      "title": "Twitter",
      "url": "https://twitter.com/username"
    },
    {
      "title": "Instagram",
      "url": "https://instagram.com/username"
    },
    {
      "title": "Facebook", 
      "url": "https://facebook.com/username"
    },
    {
      "title": "LinkedIn",
      "url": "https://linkedin.com/in/username"
    }
  ]
}
```

## 📝 実際のテスト例

### cURLコマンド例

#### 1. 自分のカード詳細取得
```bash
curl -X GET "https://flocka-api.your-domain.workers.dev/cards/your-card-id" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json"
```

#### 2. 公開カード詳細取得
```bash
curl -X GET "https://flocka-api.your-domain.workers.dev/cards/public/card-id-12345" \
  -H "Content-Type: application/json"
```

### JavaScript/TypeScript例
```typescript
// 認証済みユーザーのカード詳細取得
const getCardDetails = async (cardId: string, token: string) => {
  const response = await fetch(`/cards/${cardId}`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });
  
  const result = await response.json();
  if (result.success) {
    const { links, image_url, card_name } = result.data;
    
    // SNSリンクを表示
    links?.forEach((link: any) => {
      console.log(`${link.title}: ${link.url}`);
    });
  }
};

// 公開カード詳細取得
const getPublicCardDetails = async (cardId: string) => {
  const response = await fetch(`/cards/public/${cardId}`);
  const result = await response.json();
  
  if (result.success) {
    return result.data;
  }
};
```

## 🎯 フロントエンド実装のヒント

### SNSリンクの表示例
```typescript
const renderSocialLinks = (links: Array<{title: string, url: string}>) => {
  return links.map((link, index) => (
    <a
      key={index}
      href={link.url}
      target="_blank"
      rel="noopener noreferrer"
      className="social-link"
    >
      <span className="social-icon">{getSocialIcon(link.title)}</span>
      <span className="social-title">{link.title}</span>
    </a>
  ));
};

const getSocialIcon = (title: string) => {
  const iconMap = {
    'Twitter': '🐦',
    'Instagram': '📷',
    'Facebook': '👥',
    'LinkedIn': '💼',
    'GitHub': '🔧',
    'Website': '🌐',
    'Email': '📧',
    'Phone': '📞'
  };
  
  return iconMap[title] || '🔗';
};
```

## ⚡ パフォーマンス最適化

### 画像の遅延読み込み
```typescript
const CardImage = ({ imageUrl, cardName }: { imageUrl: string, cardName: string }) => {
  return (
    <img
      src={imageUrl}
      alt={cardName}
      loading="lazy"
      onError={(e) => {
        e.currentTarget.src = '/default-card-image.png';
      }}
    />
  );
};
```

### キャッシュ戦略
- **公開カード**: ブラウザキャッシュ活用（24時間）
- **プライベートカード**: セッションキャッシュのみ
- **画像**: CDNキャッシュ推奨

## 🚀 次の実装予定

1. **リアルタイム更新**: WebSocketでカード更新通知
2. **アナリティクス**: カード閲覧統計
3. **カスタムテーマ**: カード表示スタイルのカスタマイズ
4. **検索機能**: SNSリンクでのカード検索
