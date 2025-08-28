# WebSocket即時交換通知システム

## 概要
QRコード交換が完了すると、WebSocketを通じてQRコード生成者にリアルタイムで通知が送信されます。

## エンドポイント

### WebSocket接続
```
GET /websocket/connect
```
- **認証**: 必須（Bearer Token）
- **用途**: WebSocket接続を確立してリアルタイム通知を受信

### WebSocket接続状態確認
```
GET /websocket/status
```
- **認証**: 必須（Bearer Token）
- **用途**: WebSocket接続情報を取得

## 使用方法

### 1. WebSocket接続の確立
```javascript
// JWT トークンを取得
const token = 'your-jwt-token';

// WebSocket 接続
const ws = new WebSocket(`wss://flocka-api.kazu3jp-purin.workers.dev/websocket/connect?userId=${userId}&token=${token}`);

ws.onopen = function(event) {
    console.log('WebSocket接続が確立されました');
};

ws.onmessage = function(event) {
    const message = JSON.parse(event.data);
    console.log('リアルタイム通知:', message);
    
    if (message.type === 'qr_exchange_completed') {
        // QR交換完了通知を処理
        handleExchangeNotification(message.data);
    }
};

ws.onclose = function(event) {
    console.log('WebSocket接続が閉じられました');
};

ws.onerror = function(error) {
    console.error('WebSocketエラー:', error);
};
```

### 2. 通知メッセージの形式

#### 接続確認メッセージ
```json
{
  "type": "connected",
  "message": "WebSocket connected successfully",
  "timestamp": "2025-08-28T13:00:00.000Z"
}
```

#### QR交換完了通知
```json
{
  "type": "qr_exchange_completed",
  "data": {
    "type": "qr_exchange_completed",
    "scannerUser": {
      "id": "scanner-user-id",
      "name": "scanner@example.com"
    },
    "scannerCard": {
      "id": "scanner-card-id",
      "name": "スキャナーのカード名",
      "bio": "スキャナーの自己紹介",
      "image_url": "https://flocka-storage.kazu3jp-purin.workers.dev/card-image.jpg"
    },
    "qrCard": {
      "id": "qr-card-id",
      "name": "あなたのカード名"
    },
    "memo": "交換メッセージ",
    "location": {
      "name": "交換場所",
      "latitude": 35.6762,
      "longitude": 139.6503
    },
    "exchangeTime": "2025-08-28T13:00:00.000Z"
  },
  "timestamp": "2025-08-28T13:00:00.000Z"
}
```

### 3. フロントエンド実装例（React Native）

```javascript
import { useEffect, useState } from 'react';

const useExchangeNotifications = (token, userId) => {
  const [ws, setWs] = useState(null);
  const [notifications, setNotifications] = useState([]);

  useEffect(() => {
    if (!token || !userId) return;

    const websocket = new WebSocket(
      `wss://flocka-api.kazu3jp-purin.workers.dev/websocket/connect?userId=${userId}&token=${token}`
    );

    websocket.onopen = () => {
      console.log('リアルタイム通知が有効になりました');
      setWs(websocket);
    };

    websocket.onmessage = (event) => {
      const message = JSON.parse(event.data);
      
      if (message.type === 'qr_exchange_completed') {
        setNotifications(prev => [...prev, message.data]);
        
        // UI通知やプッシュ通知を表示
        showExchangeNotification(message.data);
      }
    };

    websocket.onclose = () => {
      console.log('WebSocket接続が切断されました');
      setWs(null);
    };

    return () => {
      if (websocket.readyState === WebSocket.OPEN) {
        websocket.close();
      }
    };
  }, [token, userId]);

  return { ws, notifications };
};

const showExchangeNotification = (data) => {
  // React Nativeの通知ライブラリを使用
  Alert.alert(
    'QR交換完了！',
    `${data.scannerCard.name} からカードを受け取りました`,
    [
      {
        text: 'カードを見る',
        onPress: () => navigateToCard(data.scannerCard.id)
      }
    ]
  );
};
```

## 技術仕様

### アーキテクチャ
- **Cloudflare Durable Objects**: WebSocket接続とメッセージルーティングを管理
- **リアルタイム通知**: QR交換完了時に即座に通知送信
- **接続管理**: ユーザーIDベースの接続管理とクリーンアップ

### セキュリティ
- JWT認証による接続制御
- ユーザーID検証によるアクセス制御
- HTTPS/WSS暗号化通信

### パフォーマンス
- グローバル分散によるレイテンシ最小化
- 接続プールによる効率的なリソース管理
- 自動再接続機能（クライアント実装推奨）

## トラブルシューティング

### 接続できない場合
1. JWTトークンの有効性を確認
2. ユーザーIDが正しいか確認
3. ネットワーク接続を確認

### 通知が届かない場合
1. WebSocket接続が確立されているか確認
2. ブラウザ/アプリがバックグラウンドでないか確認
3. 再接続機能を実装

### デバッグ方法
```javascript
// 接続状態の確認
fetch('https://flocka-api.kazu3jp-purin.workers.dev/websocket/status', {
  headers: {
    'Authorization': `Bearer ${token}`
  }
})
.then(response => response.json())
.then(data => console.log('WebSocket状態:', data));
```
