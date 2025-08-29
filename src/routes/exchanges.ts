import { Hono } from 'hono';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import type { 
  HonoEnv, 
  CreateExchangeRequest, 
  UpdateExchangeRequest,
  MutualExchangeRequest,
  QRExchangeRequest,
  GenerateQRRequest,
  QRExchangeData,
  SendExchangeRequestParams,
  Card,
  User,
  Exchange,
  QRExchangeLog
} from '../types';

const exchanges = new Hono<HonoEnv>();

// カード交換QRデータの解析関数
function parseCardExchangeQRData(qrData: string): QRExchangeData | null {
  try {
    const data = JSON.parse(qrData);
    
    if (data.type === 'card_exchange' && 
        data.cardId && 
        data.userId && 
        data.token && 
        data.timestamp) {
      
      // タイムスタンプの有効性チェック（30分以内）
      const now = Date.now();
      const qrTimestamp = data.timestamp;
      const diffMinutes = (now - qrTimestamp) / (1000 * 60);
      
      if (diffMinutes > 30) {
        return null; // 期限切れ
      }
      
      return data;
    }
    
    return null;
  } catch (error) {
    console.error('QR data parse error:', error);
    return null;
  }
}

/**
 * GET /exchanges
 * ユーザーのカードコレクション一覧を取得（要認証）
 */
exchanges.get('/', authMiddleware, async (c) => {
  try {
    const currentUser = getCurrentUser(c);
    
    // ユーザーがコレクションしたカード一覧を取得
    const collectionsResult = await c.env.DB.prepare(`
      SELECT 
        e.id,
        e.memo,
        e.location_name,
        e.latitude,
        e.longitude,
        e.created_at,
        c.id as card_id,
        c.card_name,
        c.bio,
        c.image_key,
        c.links,
        u.name as owner_name
      FROM exchanges e
      JOIN cards c ON e.collected_card_id = c.id
      JOIN users u ON c.user_id = u.id
      WHERE e.owner_user_id = ?
      ORDER BY e.created_at DESC
    `).bind(currentUser.userId).all();

    const collections = collectionsResult.results.map((row: any) => ({
      id: row.id,
      card: {
        id: row.card_id,
        card_name: row.card_name,
        bio: row.bio,
        image_url: row.image_key ? `https://flocka-storage.kazu3jp-purin.workers.dev/${row.image_key}` : null,
        links: row.links ? JSON.parse(row.links) : [],
        owner_name: row.owner_name,
      },
      memo: row.memo,
      location: row.location_name ? {
        name: row.location_name,
        latitude: row.latitude,
        longitude: row.longitude,
      } : null,
      collected_at: row.created_at,
    }));

    return c.json({
      success: true,
      data: {
        collections,
        total: collections.length,
      },
    });
  } catch (error) {
    console.error('Get collections error:', error);
    return c.json({
      success: false,
      error: 'Failed to fetch collections',
    }, 500);
  }
});

/**
 * POST /exchanges
 * 新しいカード交換を作成（要認証）
 */
exchanges.post('/', authMiddleware, async (c) => {
  try {
    const currentUser = getCurrentUser(c);
    const body: CreateExchangeRequest = await c.req.json();
    const { collected_card_id, memo, location_name, latitude, longitude } = body;

    // バリデーション
    if (!collected_card_id) {
      return c.json({
        success: false,
        error: 'Card ID is required',
      }, 400);
    }

    // カードの存在確認
    const card = await c.env.DB.prepare(
      'SELECT id, user_id, card_name FROM cards WHERE id = ?'
    ).bind(collected_card_id).first() as Card | null;

    if (!card) {
      return c.json({
        success: false,
        error: 'Card not found',
      }, 404);
    }

    // 自分のカードは交換できない
    if (card.user_id === currentUser.userId) {
      return c.json({
        success: false,
        error: 'Cannot collect your own card',
      }, 400);
    }

    // 既にコレクションしている場合はエラー
    const existingExchange = await c.env.DB.prepare(
      'SELECT id FROM exchanges WHERE owner_user_id = ? AND collected_card_id = ?'
    ).bind(currentUser.userId, collected_card_id).first();

    if (existingExchange) {
      return c.json({
        success: false,
        error: 'Card already in your collection',
      }, 409);
    }

    // 新しい交換レコードを作成
    const exchangeId = crypto.randomUUID();
    await c.env.DB.prepare(
      'INSERT INTO exchanges (id, owner_user_id, collected_card_id, memo, location_name, latitude, longitude) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).bind(
      exchangeId,
      currentUser.userId,
      collected_card_id,
      memo,
      location_name,
      latitude,
      longitude
    ).run();

    return c.json({
      success: true,
      message: 'Card added to collection successfully',
      data: {
        exchangeId,
        cardName: card.card_name,
      },
    });
  } catch (error) {
    console.error('Create exchange error:', error);
    return c.json({
      success: false,
      error: 'Failed to create exchange',
    }, 500);
  }
});

/**
 * PUT /exchanges/:id
 * コレクションのメモや位置情報を更新（要認証）
 */
exchanges.put('/:id', authMiddleware, async (c) => {
  try {
    const currentUser = getCurrentUser(c);
    const exchangeId = c.req.param('id');
    const body: UpdateExchangeRequest = await c.req.json();

    // デフォルト値を設定
    const memo = body.memo ?? '';
    const location_name = body.location_name ?? null;
    const latitude = body.latitude ?? null;
    const longitude = body.longitude ?? null;

    // 交換記録の存在確認と所有者確認
    const existingExchange = await c.env.DB.prepare(
      'SELECT id, owner_user_id FROM exchanges WHERE id = ?'
    ).bind(exchangeId).first() as Exchange | null;

    if (!existingExchange) {
      return c.json({
        success: false,
        error: 'Exchange record not found',
      }, 404);
    }

    // 所有者確認
    if (existingExchange.owner_user_id !== currentUser.userId) {
      return c.json({
        success: false,
        error: 'Not authorized to update this exchange',
      }, 403);
    }

    // 更新処理
    await c.env.DB.prepare(
      'UPDATE exchanges SET memo = ?, location_name = ?, latitude = ?, longitude = ? WHERE id = ?'
    ).bind(memo, location_name, latitude, longitude, exchangeId).run();

    return c.json({
      success: true,
      message: 'Exchange updated successfully',
      data: {
        exchangeId,
        memo,
        location_name,
        latitude,
        longitude,
      },
    });
  } catch (error) {
    console.error('Update exchange error:', error);

    // error を明示的に型キャスト
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    return c.json({
      success: false,
      error: `Failed to update exchange: ${errorMessage}`,
    }, 500);
  }
});

/**
 * GET /exchanges/:id
 * 特定の交換記録詳細を取得（要認証）
 */
exchanges.get('/:id', authMiddleware, async (c) => {
  try {
    const currentUser = getCurrentUser(c);
    const exchangeId = c.req.param('id');

    // 交換記録詳細を取得
    const exchangeResult = await c.env.DB.prepare(`
      SELECT 
        e.id,
        e.memo,
        e.location_name,
        e.latitude,
        e.longitude,
        e.created_at,
        c.id as card_id,
        c.card_name,
        c.bio,
        c.image_key,
        c.links,
        u.name as owner_name
      FROM exchanges e
      JOIN cards c ON e.collected_card_id = c.id
      JOIN users u ON c.user_id = u.id
      WHERE e.id = ? AND e.owner_user_id = ?
    `).bind(exchangeId, currentUser.userId).first();

    if (!exchangeResult) {
      return c.json({
        success: false,
        error: 'Exchange record not found',
      }, 404);
    }

    const row = exchangeResult as any;
    const exchange = {
      id: row.id,
      card: {
        id: row.card_id,
        card_name: row.card_name,
        bio: row.bio,
        image_url: row.image_key ? `https://flocka-storage.kazu3jp-purin.workers.dev/${row.image_key}` : null,
        links: row.links ? JSON.parse(row.links) : [],
        owner_name: row.owner_name,
      },
      memo: row.memo,
      location: row.location_name ? {
        name: row.location_name,
        latitude: row.latitude,
        longitude: row.longitude,
      } : null,
      collected_at: row.created_at,
    };

    return c.json({
      success: true,
      data: exchange,
    });
  } catch (error) {
    console.error('Get exchange error:', error);
    return c.json({
      success: false,
      error: 'Failed to fetch exchange',
    }, 500);
  }
});

/**
 * DELETE /exchanges/:id
 * コレクションから交換記録を削除（要認証）
 */
exchanges.delete('/:id', authMiddleware, async (c) => {
  try {
    const currentUser = getCurrentUser(c);
    const exchangeId = c.req.param('id');

    // 交換記録の存在確認と所有者確認
    const existingExchange = await c.env.DB.prepare(
      'SELECT id, owner_user_id FROM exchanges WHERE id = ?'
    ).bind(exchangeId).first() as Exchange | null;

    if (!existingExchange) {
      return c.json({
        success: false,
        error: 'Exchange record not found',
      }, 404);
    }

    // 所有者確認
    if (existingExchange.owner_user_id !== currentUser.userId) {
      return c.json({
        success: false,
        error: 'Not authorized to delete this exchange',
      }, 403);
    }

    // 削除処理
    await c.env.DB.prepare(
      'DELETE FROM exchanges WHERE id = ?'
    ).bind(exchangeId).run();

    return c.json({
      success: true,
      message: 'Exchange deleted successfully',
    });
  } catch (error) {
    console.error('Delete exchange error:', error);
    return c.json({
      success: false,
      error: 'Failed to delete exchange',
    }, 500);
  }
});

/**
 * POST /exchanges/qr/generate
 * QRコード用トークンを生成（要認証）
 */
exchanges.post('/qr/generate', authMiddleware, async (c) => {
  try {
    const currentUser = getCurrentUser(c);
    const body: GenerateQRRequest = await c.req.json();
    const { cardId } = body;

    if (!cardId) {
      return c.json({
        success: false,
        error: 'Card ID is required',
      }, 400);
    }

    // カードの存在確認と所有者チェック
    const card = await c.env.DB.prepare(
      'SELECT id, card_name FROM cards WHERE id = ? AND user_id = ?'
    ).bind(cardId, currentUser.userId).first() as Card | null;

    if (!card) {
      return c.json({
        success: false,
        error: 'Card not found or not owned by you',
      }, 404);
    }

    // 既存のトークンを削除
    await c.env.DB.prepare(
      'DELETE FROM qr_exchange_tokens WHERE user_id = ? AND card_id = ?'
    ).bind(currentUser.userId, cardId).run();

    // 新しいトークンを生成
    const token = crypto.randomUUID();
    await c.env.DB.prepare(
      'INSERT INTO qr_exchange_tokens (token, user_id, card_id) VALUES (?, ?, ?)'
    ).bind(token, currentUser.userId, cardId).run();

    const qrData: QRExchangeData = {
      type: 'card_exchange',
      cardId,
      userId: currentUser.userId,
      token,
      timestamp: Date.now(),
    };

    return c.json({
      success: true,
      data: {
        qrData: JSON.stringify(qrData),
        token,
        cardName: card.card_name,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      },
    });
  } catch (error) {
    console.error('Generate QR token error:', error);
    
    // エラーの詳細情報を含める
    const errorDetails: any = {
      success: false,
      error: 'Failed to generate QR token',
      timestamp: new Date().toISOString(),
    };

    // エラータイプとIDを生成
    if (error instanceof Error) {
      errorDetails.errorMessage = error.message;
      
      // SQLエラーの場合
      if (error.message.includes('UNIQUE constraint failed')) {
        errorDetails.errorType = 'duplicate_token_error';
        errorDetails.errorId = `dup_token_${Date.now()}`;
      } else if (error.message.includes('FOREIGN KEY constraint failed')) {
        errorDetails.errorType = 'foreign_key_error';
        errorDetails.errorId = `fk_error_${Date.now()}`;
      } else if (error.message.includes('no such table') || 
                 error.message.includes('no such column')) {
        errorDetails.errorType = 'database_schema_error';
        errorDetails.errorId = `schema_error_${Date.now()}`;
      } else {
        errorDetails.errorType = 'general_database_error';
        errorDetails.errorId = `db_error_${Date.now()}`;
      }
    } else {
      errorDetails.errorType = 'unknown_error';
      errorDetails.errorId = `unknown_error_${Date.now()}`;
    }

    return c.json(errorDetails, 500);
  }
});

/**
 * POST /exchanges/qr
 * QRコード交換の実行（要認証）
 * QRを読み取った側がリクエストし、即座に双方向交換を実行
 */
exchanges.post('/qr', authMiddleware, async (c) => {
  try {
    console.log('QR exchange request started');
    const currentUser = getCurrentUser(c);
    console.log('Current user:', currentUser.userId);
    
    const body: QRExchangeRequest = await c.req.json();
    const { qrData, myCardId, memo, location_name, latitude, longitude } = body;
    console.log('Request body received:', { qrDataType: typeof qrData, myCardId, memo });

    // バリデーション
    if (!qrData || !myCardId) {
      console.log('Validation failed: missing qrData or myCardId');
      return c.json({
        success: false,
        error: 'QR data and your card ID are required',
      }, 400);
    }

    // QRデータからトークンとカードIDを抽出
  let token: string;
  let cardId: string | null = null;
    
    try {
      console.log('Parsing QR data:', qrData);
      // qrDataが直接トークンの場合（BLEなど）
      if (typeof qrData === 'string' && !qrData.startsWith('{')) {
        token = qrData;
        console.log('QR data is direct token (opaque)');
      } else {
        console.log('QR data is JSON format, parsing with parseCardExchangeQRData');
        const qrContent = parseCardExchangeQRData(qrData);
        if (!qrContent) {
          console.log('parseCardExchangeQRData returned null');
          return c.json({
            success: false,
            error: 'Invalid or expired QR code format',
          }, 400);
        }
        token = qrContent.token;
        cardId = qrContent.cardId;
        console.log('Parsed QR content:', qrContent);
      }
    } catch (error) {
      console.error('QR data parsing error:', error);
      return c.json({
        success: false,
        error: 'Invalid QR code format',
      }, 400);
    }

  console.log('Extracted token and cardId (pre-validate):', { token, cardId });

    // QRコードトークンの有効性をチェック
    console.log('Checking QR token validity');
    const qrToken = await c.env.DB.prepare(
      'SELECT * FROM qr_exchange_tokens WHERE token = ? AND expires_at > datetime("now")'
    ).bind(token).first();

    if (!qrToken) {
      console.log('QR token not found or expired');
      return c.json({
        success: false,
        error: 'QR code token is invalid or expired',
      }, 400);
    }
    console.log('QR token is valid:', qrToken);

    // 直接トークンのみを受け取った場合（BLEなど）、DBのトークン行からcardIdを補完
    try {
  if (!cardId && qrToken && (qrToken as any).card_id) {
        cardId = (qrToken as any).card_id as string;
        console.log('cardId derived from qrToken.card_id:', cardId);
      }
    } catch (e) {
      console.warn('Failed to derive cardId from qrToken:', e);
    }

    // 相手のカード情報を取得
    if (!cardId) {
      return c.json({ success: false, error: 'Card ID could not be determined from token' }, 400);
    }
    console.log('Fetching target card:', cardId);
    const otherCard = await c.env.DB.prepare(
      'SELECT * FROM cards WHERE id = ?'
    ).bind(cardId).first() as Card | null;

    if (!otherCard) {
      console.log('Target card not found');
      return c.json({
        success: false,
        error: 'Target card not found',
      }, 404);
    }
    console.log('Target card found:', otherCard);

    // 自分のカード情報を取得
    console.log('Fetching my card:', myCardId);
    const myCard = await c.env.DB.prepare(
      'SELECT * FROM cards WHERE id = ? AND user_id = ?'
    ).bind(myCardId, currentUser.userId).first() as Card | null;

    if (!myCard) {
      console.log('My card not found or not owned');
      return c.json({
        success: false,
        error: 'Your card not found or not owned by you',
      }, 404);
    }
    console.log('My card found:', myCard);

    // 同じユーザー同士の交換を防ぐ
    if (otherCard.user_id === currentUser.userId) {
      console.log('Attempted self exchange');
      return c.json({
        success: false,
        error: 'Cannot exchange cards with yourself',
      }, 400);
    }

    // 既に双方が持っている場合はスキップ（重複防止）
    const existingMyCollection = await c.env.DB.prepare(
      'SELECT id FROM exchanges WHERE owner_user_id = ? AND collected_card_id = ?'
    ).bind(currentUser.userId, otherCard.id).first();

    const existingOtherCollection = await c.env.DB.prepare(
      'SELECT id FROM exchanges WHERE owner_user_id = ? AND collected_card_id = ?'
    ).bind(otherCard.user_id, myCard.id).first();

    console.log('Exchange preparation complete');

    // 即時双方向交換を実行
    const exchangeId1 = crypto.randomUUID();
    const exchangeId2 = crypto.randomUUID();
    const logId = crypto.randomUUID();

    // トランザクション的な処理（D1はトランザクションをサポートしていないため、逐次実行）
    const exchangeResults: string[] = [];

    // 1. 読み取り者 -> QR生成者のカードをコレクション
    if (!existingMyCollection) {
      const result1 = await c.env.DB.prepare(
        'INSERT INTO exchanges (id, owner_user_id, collected_card_id, memo, location_name, latitude, longitude) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).bind(
        exchangeId1,
        currentUser.userId,
        otherCard.id,
        memo || `QR交換: ${otherCard.card_name}`,
        location_name || null,
        latitude || null,
        longitude || null
      ).run();
      exchangeResults.push('Scanner -> QR Owner card collected');
    }

    // 2. QR生成者 -> 読み取り者のカードをコレクション
    if (!existingOtherCollection) {
      const result2 = await c.env.DB.prepare(
        'INSERT INTO exchanges (id, owner_user_id, collected_card_id, memo, location_name, latitude, longitude) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).bind(
        exchangeId2,
        otherCard.user_id,
        myCard.id,
        `QR交換: ${currentUser.userId}から`,
        location_name || null,
        latitude || null,
        longitude || null
      ).run();
      exchangeResults.push('QR Owner -> Scanner card collected');
    }

    // 3. QR交換ログを記録（リアルタイム通知用）
    const logResult = await c.env.DB.prepare(
      'INSERT INTO qr_exchange_logs (id, qr_owner_user_id, scanner_user_id, scanner_card_id, qr_card_id, memo, location_name, latitude, longitude, notified) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(
      logId,
      otherCard.user_id, // QRコード生成者
      currentUser.userId, // QRコード読み込み者
      myCard.id, // 読み込み者のカード
      otherCard.id, // QRコードのカード
      memo || `${myCard.card_name} とのQR交換`,
      location_name || null,
      latitude || null,
      longitude || null,
      0 // 未通知
    ).run();

    console.log('Exchange and log insert results:', { exchangeResults, logResult });

    return c.json({
      success: true,
      message: 'QR exchange completed successfully',
      data: {
        exchangeLogId: logId,
        exchangedCards: {
          yourNewCard: {
            id: otherCard.id,
            name: otherCard.card_name,
            bio: otherCard.bio,
            image_url: otherCard.image_key ? `https://flocka-storage.kazu3jp-purin.workers.dev/${otherCard.image_key}` : null,
          },
          yourCardSent: {
            id: myCard.id,
            name: myCard.card_name,
          },
        },
        location: location_name ? {
          name: location_name,
          latitude,
          longitude,
        } : null,
        message: 'QR交換が完了しました。相手にもあなたのカードが送信されました。',
      },
    });
  } catch (error) {
    console.error('QR exchange error:', error);
    if (error instanceof Error) {
      console.error('Error stack:', error.stack);
    }
    
    // エラーの詳細情報を含める
    const errorDetails: any = {
      success: false,
      error: 'Failed to complete QR exchange',
      timestamp: new Date().toISOString(),
    };

    // エラータイプとIDを生成
    if (error instanceof Error) {
      errorDetails.errorMessage = error.message;
      errorDetails.debug = error.message;
      
      // SQLエラーの場合
      if (error.message.includes('UNIQUE constraint failed')) {
        errorDetails.errorType = 'duplicate_exchange_error';
        errorDetails.errorId = `dup_exch_${Date.now()}`;
      } else if (error.message.includes('FOREIGN KEY constraint failed')) {
        errorDetails.errorType = 'foreign_key_error';
        errorDetails.errorId = `fk_error_${Date.now()}`;
      } else if (error.message.includes('no such table') || 
                 error.message.includes('no such column')) {
        errorDetails.errorType = 'database_schema_error';
        errorDetails.errorId = `schema_error_${Date.now()}`;
      } else if (error.message.includes('bind') || 
                 error.message.includes('parameter')) {
        errorDetails.errorType = 'parameter_binding_error';
        errorDetails.errorId = `param_error_${Date.now()}`;
      } else {
        errorDetails.errorType = 'general_database_error';
        errorDetails.errorId = `db_error_${Date.now()}`;
      }
    } else {
      errorDetails.errorType = 'unknown_error';
      errorDetails.errorId = `unknown_error_${Date.now()}`;
      errorDetails.debug = String(error);
    }

    return c.json(errorDetails, 500);
  }
});

/**
 * GET /exchanges/qr-logs
 * QR交換ログ一覧を取得（要認証）
 * QRコードを生成したユーザーが、自分のQRを読み込んだユーザーからの交換履歴を確認
 */
exchanges.get('/qr-logs', authMiddleware, async (c) => {
  try {
    const currentUser = getCurrentUser(c);

    // 自分宛のQR交換ログを取得
    const logsResult = await c.env.DB.prepare(`
      SELECT 
        l.id,
        l.qr_owner_user_id,
        l.scanner_user_id,
        l.scanner_card_id,
        l.qr_card_id,
        l.memo,
        l.location_name,
        l.latitude,
        l.longitude,
        l.notified,
        l.created_at,
        scanner_user.name as scanner_name,
        scanner_card.card_name as scanner_card_name,
        scanner_card.bio as scanner_card_bio,
        scanner_card.image_key as scanner_card_image_key,
        qr_card.card_name as qr_card_name
      FROM qr_exchange_logs l
      JOIN users scanner_user ON l.scanner_user_id = scanner_user.id
      JOIN cards scanner_card ON l.scanner_card_id = scanner_card.id
      JOIN cards qr_card ON l.qr_card_id = qr_card.id
      WHERE l.qr_owner_user_id = ?
      ORDER BY l.created_at DESC
    `).bind(currentUser.userId).all();

    const logs = logsResult.results.map((row: any) => ({
      id: row.id,
      scannerUser: {
        id: row.scanner_user_id,
        name: row.scanner_name,
      },
      scannerCard: {
        id: row.scanner_card_id,
        name: row.scanner_card_name,
        bio: row.scanner_card_bio,
        image_url: row.scanner_card_image_key ? `https://flocka-storage.kazu3jp-purin.workers.dev/${row.scanner_card_image_key}` : null,
      },
      qrCard: {
        id: row.qr_card_id,
        name: row.qr_card_name,
      },
      memo: row.memo,
      location: row.location_name ? {
        name: row.location_name,
        latitude: row.latitude,
        longitude: row.longitude,
      } : null,
      notified: row.notified === 1,
      created_at: row.created_at,
    }));

    // 未通知のログがあれば通知済みにマーク
    const unnotifiedLogs = logs.filter(log => !log.notified);
    if (unnotifiedLogs.length > 0) {
      const logIds = unnotifiedLogs.map(log => log.id);
      for (const logId of logIds) {
        await c.env.DB.prepare(
          'UPDATE qr_exchange_logs SET notified = 1 WHERE id = ?'
        ).bind(logId).run();
      }
    }

    return c.json({
      success: true,
      data: {
        logs,
        total: logs.length,
        newLogs: unnotifiedLogs.length,
      },
    });
  } catch (error) {
    console.error('Get QR exchange logs error:', error);
    
    // エラーの詳細情報を含める
    const errorDetails: any = {
      success: false,
      error: 'Failed to fetch QR exchange logs',
      timestamp: new Date().toISOString(),
    };

    // 特定のエラータイプの場合、追加情報を含める
    if (error instanceof Error) {
      errorDetails.errorMessage = error.message;
      
      // SQLエラーの場合、テーブル関連のエラーかチェック
      if (error.message.includes('no such table') || 
          error.message.includes('no such column') ||
          error.message.includes('FOREIGN KEY constraint failed')) {
        errorDetails.errorType = 'database_schema_error';
        errorDetails.errorId = `schema_error_${Date.now()}`;
      } else if (error.message.includes('bind') || 
                 error.message.includes('parameter')) {
        errorDetails.errorType = 'parameter_binding_error';
        errorDetails.errorId = `param_error_${Date.now()}`;
      } else {
        errorDetails.errorType = 'general_database_error';
        errorDetails.errorId = `db_error_${Date.now()}`;
      }
    } else {
      errorDetails.errorType = 'unknown_error';
      errorDetails.errorId = `unknown_error_${Date.now()}`;
    }

    return c.json(errorDetails, 500);
  }
});

/**
 * DELETE /exchanges/qr/logs/:id
 * QR交換ログを削除（要認証）
 */
exchanges.delete('/qr/logs/:id', authMiddleware, async (c) => {
  try {
    const currentUser = getCurrentUser(c);
    const logId = c.req.param('id');

    // QRログの存在確認と所有者確認
    const existingLog = await c.env.DB.prepare(
      'SELECT id, qr_owner_user_id, scanner_user_id FROM qr_exchange_logs WHERE id = ?'
    ).bind(logId).first() as QRExchangeLog | null;

    if (!existingLog) {
      return c.json({
        success: false,
        error: 'QR exchange log not found',
      }, 404);
    }

    // 所有者確認（QR作成者またはスキャンした人のみ削除可能）
    if (existingLog.qr_owner_user_id !== currentUser.userId && 
        existingLog.scanner_user_id !== currentUser.userId) {
      return c.json({
        success: false,
        error: 'Not authorized to delete this QR exchange log',
      }, 403);
    }

    // 削除処理
    await c.env.DB.prepare(
      'DELETE FROM qr_exchange_logs WHERE id = ?'
    ).bind(logId).run();

    return c.json({
      success: true,
      message: 'QR exchange log deleted successfully',
    });
  } catch (error) {
    console.error('Delete QR exchange log error:', error);
    
    // エラーの詳細情報を含める
    const errorDetails: any = {
      success: false,
      error: 'Failed to delete QR exchange log',
      timestamp: new Date().toISOString(),
    };

    // 特定のエラータイプの場合、追加情報を含める
    if (error instanceof Error) {
      errorDetails.errorMessage = error.message;
      
      // SQLエラーの場合、外部キー制約エラーかチェック
      if (error.message.includes('FOREIGN KEY constraint failed')) {
        errorDetails.errorType = 'foreign_key_error';
        errorDetails.errorId = `fk_error_${Date.now()}`;
      } else if (error.message.includes('no such table') || 
                 error.message.includes('no such column')) {
        errorDetails.errorType = 'database_schema_error';
        errorDetails.errorId = `schema_error_${Date.now()}`;
      } else if (error.message.includes('bind') || 
                 error.message.includes('parameter')) {
        errorDetails.errorType = 'parameter_binding_error';
        errorDetails.errorId = `param_error_${Date.now()}`;
      } else {
        errorDetails.errorType = 'general_database_error';
        errorDetails.errorId = `db_error_${Date.now()}`;
      }
    } else {
      errorDetails.errorType = 'unknown_error';
      errorDetails.errorId = `unknown_error_${Date.now()}`;
    }

    return c.json(errorDetails, 500);
  }
});

export default exchanges;
