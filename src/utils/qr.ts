/**
 * QRコード関連のユーティリティ
 */

/**
 * カード交換用のQRコードデータを生成する
 */
export function generateCardExchangeQRData(cardId: string, userId: string, exchangeToken: string): string {
  const exchangeData = {
    type: 'card_exchange',
    cardId,
    userId,
    token: exchangeToken,
    timestamp: Date.now(),
  };
  
  return JSON.stringify(exchangeData);
}

/**
 * QRコードデータを検証・パースする
 */
export function parseCardExchangeQRData(qrData: string): {
  cardId: string;
  userId: string;
  token: string;
  timestamp: number;
} | null {
  try {
    const data = JSON.parse(qrData);
    
    if (data.type !== 'card_exchange' || !data.cardId || !data.userId || !data.token) {
      return null;
    }
    
    // QRコードの有効期限をチェック（30分）
    const maxAge = 30 * 60 * 1000; // 30分
    if (Date.now() - data.timestamp > maxAge) {
      return null;
    }
    
    return {
      cardId: data.cardId,
      userId: data.userId,
      token: data.token,
      timestamp: data.timestamp,
    };
  } catch (error) {
    return null;
  }
}

/**
 * 交換用のトークンを生成する（短時間有効）
 */
export function generateExchangeToken(): string {
  return crypto.randomUUID();
}
