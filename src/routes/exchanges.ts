import { Hono } from 'hono';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import type { 
  HonoEnv, 
  CreateExchangeRequest, 
  UpdateExchangeRequest, 
  QRExchangeRequest,
  SendExchangeRequestParams,
  Exchange, 
  Card, 
  User 
} from '../types';
import { 
  parseCardExchangeQRData,
  validateMemo,
  validateCoordinates
} from '../utils';

const exchanges = new Hono<HonoEnv>();

/**
 * POST /exchanges
 * カードを交換してコレクションに追加（要認証）
 * 場所情報とメモも一緒に保存可能
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

    // 交換対象カードの存在確認
    const targetCard = await c.env.DB.prepare(
      'SELECT id, user_id, card_name FROM cards WHERE id = ?'
    ).bind(collected_card_id).first() as Card | null;

    if (!targetCard) {
      return c.json({
        success: false,
        error: 'Card not found',
      }, 404);
    }

    // 自分のカードは交換できない
    if (targetCard.user_id === currentUser.userId) {
      return c.json({
        success: false,
        error: 'You cannot collect your own card',
      }, 400);
    }

    // 重複交換チェック
    const existingExchange = await c.env.DB.prepare(
      'SELECT id FROM exchanges WHERE owner_user_id = ? AND collected_card_id = ?'
    ).bind(currentUser.userId, collected_card_id).first();

    if (existingExchange) {
      return c.json({
        success: false,
        error: 'You have already collected this card',
      }, 409);
    }

    // 交換記録をデータベースに保存
    const exchangeId = crypto.randomUUID();
    await c.env.DB.prepare(
      `INSERT INTO exchanges 
       (id, owner_user_id, collected_card_id, memo, location_name, latitude, longitude) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      exchangeId,
      currentUser.userId,
      collected_card_id,
      memo || null,
      location_name || null,
      latitude || null,
      longitude || null
    ).run();

    // 作成された交換記録を取得
    const createdExchange = await c.env.DB.prepare(
      'SELECT * FROM exchanges WHERE id = ?'
    ).bind(exchangeId).first() as Exchange;

    return c.json({
      success: true,
      data: createdExchange,
      message: 'Card collected successfully',
    }, 201);
  } catch (error) {
    console.error('Create exchange error:', error);
    return c.json({
      success: false,
      error: 'Failed to collect card',
    }, 500);
  }
});

/**
 * GET /exchanges
 * 自分がコレクションしたカードの一覧を取得（要認証）
 */
exchanges.get('/', authMiddleware, async (c) => {
  try {
    const currentUser = getCurrentUser(c);

    // コレクションしたカードの一覧を取得（カード情報と作成者情報も含む）
    const exchangesResult = await c.env.DB.prepare(
      `SELECT 
         e.*,
         c.card_name,
         c.image_key,
         c.links,
         u.name as card_creator_name,
         u.email as card_creator_email
       FROM exchanges e
       JOIN cards c ON e.collected_card_id = c.id
       JOIN users u ON c.user_id = u.id
       WHERE e.owner_user_id = ?
       ORDER BY e.created_at DESC`
    ).bind(currentUser.userId).all();

    const exchangesWithDetails = exchangesResult.results.map((exchange: any) => ({
      id: exchange.id,
      collected_card_id: exchange.collected_card_id,
      memo: exchange.memo,
      location_name: exchange.location_name,
      latitude: exchange.latitude,
      longitude: exchange.longitude,
      created_at: exchange.created_at,
      card: {
        id: exchange.collected_card_id,
        name: exchange.card_name,
        image_key: exchange.image_key,
        links: exchange.links ? JSON.parse(exchange.links) : null,
        creator: {
          name: exchange.card_creator_name || '匿名ユーザー',
          email: exchange.card_creator_email,
        },
      },
    }));

    return c.json({
      success: true,
      data: exchangesWithDetails,
    });
  } catch (error) {
    console.error('Get exchanges error:', error);
    return c.json({
      success: false,
      error: 'Failed to get collections',
    }, 500);
  }
});

/**
 * PUT /exchanges/:id
 * コレクションしたカードのメモや場所情報を更新（要認証）
 */
exchanges.put('/:id', authMiddleware, async (c) => {
  try {
    const currentUser = getCurrentUser(c);
    const exchangeId = c.req.param('id');
    const body: UpdateExchangeRequest = await c.req.json();
    const { memo, location_name, latitude, longitude } = body;

    // 交換記録の存在確認と所有者チェック
    const existingExchange = await c.env.DB.prepare(
      'SELECT id, owner_user_id FROM exchanges WHERE id = ?'
    ).bind(exchangeId).first() as Exchange | null;

    if (!existingExchange) {
      return c.json({
        success: false,
        error: 'Exchange record not found',
      }, 404);
    }

    if (existingExchange.owner_user_id !== currentUser.userId) {
      return c.json({
        success: false,
        error: 'You are not authorized to update this exchange',
      }, 403);
    }

    // 更新フィールドを準備
    const updates: string[] = [];
    const values: any[] = [];

    if (memo !== undefined) {
      updates.push('memo = ?');
      values.push(memo);
    }

    if (location_name !== undefined) {
      updates.push('location_name = ?');
      values.push(location_name);
    }

    if (latitude !== undefined && longitude !== undefined) {
      updates.push('latitude = ?, longitude = ?');
      values.push(latitude, longitude);
    }

    if (updates.length === 0) {
      return c.json({
        success: false,
        error: 'No fields to update',
      }, 400);
    }

    // 交換記録を更新
    values.push(exchangeId);
    await c.env.DB.prepare(
      `UPDATE exchanges SET ${updates.join(', ')} WHERE id = ?`
    ).bind(...values).run();

    // 更新された交換記録を取得
    const updatedExchange = await c.env.DB.prepare(
      'SELECT * FROM exchanges WHERE id = ?'
    ).bind(exchangeId).first() as Exchange;

    return c.json({
      success: true,
      data: updatedExchange,
      message: 'Exchange record updated successfully',
    });
  } catch (error) {
    console.error('Update exchange error:', error);
    return c.json({
      success: false,
      error: 'Failed to update exchange record',
    }, 500);
  }
});

/**
 * DELETE /exchanges/:id
 * コレクションからカードを削除（要認証）
 */
exchanges.delete('/:id', authMiddleware, async (c) => {
  try {
    const currentUser = getCurrentUser(c);
    const exchangeId = c.req.param('id');

    // 交換記録の存在確認と所有者チェック
    const existingExchange = await c.env.DB.prepare(
      'SELECT id, owner_user_id FROM exchanges WHERE id = ?'
    ).bind(exchangeId).first() as Exchange | null;

    if (!existingExchange) {
      return c.json({
        success: false,
        error: 'Exchange record not found',
      }, 404);
    }

    if (existingExchange.owner_user_id !== currentUser.userId) {
      return c.json({
        success: false,
        error: 'You are not authorized to delete this exchange',
      }, 403);
    }

    // データベースから交換記録を削除
    await c.env.DB.prepare(
      'DELETE FROM exchanges WHERE id = ?'
    ).bind(exchangeId).run();

    return c.json({
      success: true,
      message: 'Exchange record deleted successfully',
    });
  } catch (error) {
    console.error('Delete exchange error:', error);
    return c.json({
      success: false,
      error: 'Failed to delete exchange record',
    }, 500);
  }
});

/**
 * GET /exchanges/:id
 * 特定の交換記録の詳細を取得（要認証）
 */
exchanges.get('/:id', authMiddleware, async (c) => {
  try {
    const currentUser = getCurrentUser(c);
    const exchangeId = c.req.param('id');

    // 交換記録の詳細を取得
    const exchangeResult = await c.env.DB.prepare(
      `SELECT 
         e.*,
         c.card_name,
         c.image_key,
         c.links,
         u.name as card_creator_name,
         u.email as card_creator_email
       FROM exchanges e
       JOIN cards c ON e.collected_card_id = c.id
       JOIN users u ON c.user_id = u.id
       WHERE e.id = ? AND e.owner_user_id = ?`
    ).bind(exchangeId, currentUser.userId).first();

    if (!exchangeResult) {
      return c.json({
        success: false,
        error: 'Exchange record not found',
      }, 404);
    }

    const exchangeWithDetails = {
      id: exchangeResult.id,
      collected_card_id: exchangeResult.collected_card_id,
      memo: exchangeResult.memo,
      location_name: exchangeResult.location_name,
      latitude: exchangeResult.latitude,
      longitude: exchangeResult.longitude,
      created_at: exchangeResult.created_at,
      card: {
        id: exchangeResult.collected_card_id,
        name: exchangeResult.card_name,
        image_key: exchangeResult.image_key,
        links: exchangeResult.links ? JSON.parse(exchangeResult.links as string) : null,
        creator: {
          name: exchangeResult.card_creator_name || '匿名ユーザー',
          email: exchangeResult.card_creator_email,
        },
      },
    };

    return c.json({
      success: true,
      data: exchangeWithDetails,
    });
  } catch (error) {
    console.error('Get exchange error:', error);
    return c.json({
      success: false,
      error: 'Failed to get exchange record',
    }, 500);
  }
});

/**
 * POST /exchanges/mutual
 * URLトークンを使った相互カード交換（要認証）
 */
exchanges.post('/mutual', authMiddleware, async (c) => {
  try {
    const currentUser = getCurrentUser(c);
    const body = await c.req.json();
    const { exchangeToken, myCardId, memo, location_name, latitude, longitude } = body;

    // バリデーション
    if (!exchangeToken || !myCardId) {
      return c.json({
        success: false,
        error: 'Exchange token and your card ID are required',
      }, 400);
    }

    // 交換トークンをデコード
    let tokenData;
    try {
      tokenData = JSON.parse(atob(exchangeToken));
    } catch (e) {
      return c.json({
        success: false,
        error: 'Invalid exchange token',
      }, 400);
    }

    // トークン有効期限チェック
    if (Date.now() > tokenData.expires) {
      return c.json({
        success: false,
        error: 'Exchange token has expired',
      }, 400);
    }

    // 相手のカード情報を取得
    const otherCard = await c.env.DB.prepare(
      'SELECT id, user_id, card_name FROM cards WHERE id = ?'
    ).bind(tokenData.cardId).first() as Card | null;

    if (!otherCard) {
      return c.json({
        success: false,
        error: 'Target card not found',
      }, 404);
    }

    // 自分のカード情報を取得
    const myCard = await c.env.DB.prepare(
      'SELECT id, user_id, card_name FROM cards WHERE id = ? AND user_id = ?'
    ).bind(myCardId, currentUser.userId).first() as Card | null;

    if (!myCard) {
      return c.json({
        success: false,
        error: 'Your card not found or not owned by you',
      }, 404);
    }

    // 同じユーザー同士の交換を防ぐ
    if (otherCard.user_id === currentUser.userId) {
      return c.json({
        success: false,
        error: 'Cannot exchange cards with yourself',
      }, 400);
    }

    // 既に相互交換済みかチェック
    const existingExchange1 = await c.env.DB.prepare(
      'SELECT id FROM exchanges WHERE owner_user_id = ? AND collected_card_id = ?'
    ).bind(currentUser.userId, otherCard.id).first();

    const existingExchange2 = await c.env.DB.prepare(
      'SELECT id FROM exchanges WHERE owner_user_id = ? AND collected_card_id = ?'
    ).bind(otherCard.user_id, myCard.id).first();

    if (existingExchange1 || existingExchange2) {
      return c.json({
        success: false,
        error: 'Cards have already been exchanged between these users',
      }, 409);
    }

    // トランザクション開始（相互交換）
    const exchangeId1 = crypto.randomUUID();
    const exchangeId2 = crypto.randomUUID();

    // 現在のユーザーが相手のカードをコレクション
    await c.env.DB.prepare(
      'INSERT INTO exchanges (id, owner_user_id, collected_card_id, memo, location_name, latitude, longitude) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).bind(
      exchangeId1,
      currentUser.userId,
      otherCard.id,
      memo || `URL交換で ${otherCard.card_name} を取得`,
      location_name,
      latitude,
      longitude
    ).run();

    // 相手のユーザーが現在のユーザーのカードをコレクション
    await c.env.DB.prepare(
      'INSERT INTO exchanges (id, owner_user_id, collected_card_id, memo, location_name, latitude, longitude) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).bind(
      exchangeId2,
      otherCard.user_id,
      myCard.id,
      `URL交換で ${myCard.card_name} を取得`,
      location_name,
      latitude,
      longitude
    ).run();

    return c.json({
      success: true,
      message: 'Cards exchanged successfully',
      data: {
        exchange1: {
          id: exchangeId1,
          collectorUserId: currentUser.userId,
          collectedCard: {
            id: otherCard.id,
            name: otherCard.card_name,
          },
        },
        exchange2: {
          id: exchangeId2,
          collectorUserId: otherCard.user_id,
          collectedCard: {
            id: myCard.id,
            name: myCard.card_name,
          },
        },
      },
    });
  } catch (error) {
    console.error('Mutual exchange error:', error);
    return c.json({
      success: false,
      error: 'Failed to exchange cards',
    }, 500);
  }
});

/**
 * GET /exchanges/token-info
 * 交換トークンの情報を取得（要認証）
 */
exchanges.get('/token-info', authMiddleware, async (c) => {
  try {
    const token = c.req.query('token');

    if (!token) {
      return c.json({
        success: false,
        error: 'Token is required',
      }, 400);
    }

    // トークンをデコード
    let tokenData;
    try {
      tokenData = JSON.parse(atob(token));
    } catch (e) {
      return c.json({
        success: false,
        error: 'Invalid token',
      }, 400);
    }

    // トークン有効期限チェック
    if (Date.now() > tokenData.expires) {
      return c.json({
        success: false,
        error: 'Token has expired',
      }, 400);
    }

    // カード情報を取得
    const card = await c.env.DB.prepare(
      'SELECT c.id, c.card_name, c.image_key, u.name as owner_name, u.id as owner_id FROM cards c JOIN users u ON c.user_id = u.id WHERE c.id = ?'
    ).bind(tokenData.cardId).first() as any;

    if (!card) {
      return c.json({
        success: false,
        error: 'Card not found',
      }, 404);
    }

    return c.json({
      success: true,
      data: {
        card: {
          id: card.id,
          name: card.card_name,
          imageKey: card.image_key,
          owner: {
            id: card.owner_id,
            name: card.owner_name,
          },
        },
        expiresAt: new Date(tokenData.expires).toISOString(),
      },
    });
  } catch (error) {
    console.error('Token info error:', error);
    return c.json({
      success: false,
      error: 'Failed to get token info',
    }, 500);
  }
});

/**
 * POST /exchanges/qr
 * QRコードスキャンによるカード交換（要認証）
 */
exchanges.post('/qr', authMiddleware, async (c) => {
  try {
    const currentUser = getCurrentUser(c);
    const body: QRExchangeRequest = await c.req.json();
    const { qrData, myCardId, memo, location_name, latitude, longitude } = body;

    // バリデーション
    if (!qrData || !myCardId) {
      return c.json({
        success: false,
        error: 'QR data and your card ID are required',
      }, 400);
    }

    // QRデータを解析
    const qrContent = parseCardExchangeQRData(qrData);
    if (!qrContent) {
      return c.json({
        success: false,
        error: 'Invalid or expired QR code',
      }, 400);
    }

    // QRコードトークンの有効性をチェック
    const qrToken = await c.env.DB.prepare(
      'SELECT * FROM qr_exchange_tokens WHERE token = ? AND expires_at > datetime("now")'
    ).bind(qrContent.token).first();

    if (!qrToken) {
      return c.json({
        success: false,
        error: 'QR code token is invalid or expired',
      }, 400);
    }

    // 相手のカード情報を取得
    const otherCard = await c.env.DB.prepare(
      'SELECT id, user_id, card_name FROM cards WHERE id = ?'
    ).bind(qrContent.cardId).first() as Card | null;

    if (!otherCard) {
      return c.json({
        success: false,
        error: 'Target card not found',
      }, 404);
    }

    // 自分のカード情報を取得
    const myCard = await c.env.DB.prepare(
      'SELECT id, user_id, card_name FROM cards WHERE id = ? AND user_id = ?'
    ).bind(myCardId, currentUser.userId).first() as Card | null;

    if (!myCard) {
      return c.json({
        success: false,
        error: 'Your card not found or not owned by you',
      }, 404);
    }

    // 同じユーザー同士の交換を防ぐ
    if (otherCard.user_id === currentUser.userId) {
      return c.json({
        success: false,
        error: 'Cannot exchange cards with yourself',
      }, 400);
    }

    // 既に相互交換済みかチェック
    const existingExchange1 = await c.env.DB.prepare(
      'SELECT id FROM exchanges WHERE owner_user_id = ? AND collected_card_id = ?'
    ).bind(currentUser.userId, otherCard.id).first();

    const existingExchange2 = await c.env.DB.prepare(
      'SELECT id FROM exchanges WHERE owner_user_id = ? AND collected_card_id = ?'
    ).bind(otherCard.user_id, myCard.id).first();

    if (existingExchange1 || existingExchange2) {
      return c.json({
        success: false,
        error: 'Cards have already been exchanged between these users',
      }, 409);
    }

    // 相互交換を実行
    const exchangeId1 = crypto.randomUUID();
    const exchangeId2 = crypto.randomUUID();

    // 現在のユーザーが相手のカードをコレクション
    await c.env.DB.prepare(
      'INSERT INTO exchanges (id, owner_user_id, collected_card_id, memo, location_name, latitude, longitude) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).bind(
      exchangeId1,
      currentUser.userId,
      otherCard.id,
      memo || `QR交換で ${otherCard.card_name} を取得`,
      location_name,
      latitude,
      longitude
    ).run();

    // 相手のユーザーが現在のユーザーのカードをコレクション
    await c.env.DB.prepare(
      'INSERT INTO exchanges (id, owner_user_id, collected_card_id, memo, location_name, latitude, longitude) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).bind(
      exchangeId2,
      otherCard.user_id,
      myCard.id,
      `QR交換で ${myCard.card_name} を取得`,
      location_name,
      latitude,
      longitude
    ).run();

    // 使用済みトークンを削除
    await c.env.DB.prepare(
      'DELETE FROM qr_exchange_tokens WHERE token = ?'
    ).bind(qrContent.token).run();

    return c.json({
      success: true,
      message: 'Cards exchanged successfully via QR code',
      data: {
        exchange1: {
          id: exchangeId1,
          collectorUserId: currentUser.userId,
          collectedCard: {
            id: otherCard.id,
            name: otherCard.card_name,
          },
        },
        exchange2: {
          id: exchangeId2,
          collectorUserId: otherCard.user_id,
          collectedCard: {
            id: myCard.id,
            name: myCard.card_name,
          },
        },
      },
    });
  } catch (error) {
    console.error('QR exchange error:', error);
    return c.json({
      success: false,
      error: 'Failed to exchange cards via QR code',
    }, 500);
  }
});

/**
 * POST /exchanges/request
 * 交換リクエストを送信（近距離交換用）（要認証）
 */
exchanges.post('/request', authMiddleware, async (c) => {
  try {
    const currentUser = getCurrentUser(c);
    const body: SendExchangeRequestParams = await c.req.json();
    const { targetUserId, cardId, message } = body;

    // バリデーション
    if (!targetUserId || !cardId) {
      return c.json({
        success: false,
        error: 'Target user ID and card ID are required',
      }, 400);
    }

    // 自分自身にリクエストを送ることを防ぐ
    if (targetUserId === currentUser.userId) {
      return c.json({
        success: false,
        error: 'Cannot send exchange request to yourself',
      }, 400);
    }

    // カードの存在確認と所有者チェック
    const card = await c.env.DB.prepare(
      'SELECT id, user_id, card_name FROM cards WHERE id = ? AND user_id = ?'
    ).bind(cardId, currentUser.userId).first() as Card | null;

    if (!card) {
      return c.json({
        success: false,
        error: 'Card not found or not owned by you',
      }, 404);
    }

    // ターゲットユーザーの存在確認
    const targetUser = await c.env.DB.prepare(
      'SELECT id, name FROM users WHERE id = ?'
    ).bind(targetUserId).first() as User | null;

    if (!targetUser) {
      return c.json({
        success: false,
        error: 'Target user not found',
      }, 404);
    }

    // 既存の pending リクエストをチェック
    const existingRequest = await c.env.DB.prepare(
      'SELECT id FROM exchange_requests WHERE from_user_id = ? AND to_user_id = ? AND status = "pending" AND expires_at > datetime("now")'
    ).bind(currentUser.userId, targetUserId).first();

    if (existingRequest) {
      return c.json({
        success: false,
        error: 'You already have a pending exchange request with this user',
      }, 409);
    }

    // 交換リクエストを作成
    const requestId = crypto.randomUUID();
    await c.env.DB.prepare(
      'INSERT INTO exchange_requests (id, from_user_id, to_user_id, card_id, message, status, created_at, expires_at) VALUES (?, ?, ?, ?, ?, "pending", datetime("now"), datetime("now", "+30 minutes"))'
    ).bind(requestId, currentUser.userId, targetUserId, cardId, message).run();

    return c.json({
      success: true,
      message: 'Exchange request sent successfully',
      data: {
        requestId,
        targetUser: {
          id: targetUser.id,
          name: targetUser.name || '匿名ユーザー',
        },
        card: {
          id: card.id,
          name: card.card_name,
        },
      },
    });
  } catch (error) {
    console.error('Send exchange request error:', error);
    return c.json({
      success: false,
      error: 'Failed to send exchange request',
    }, 500);
  }
});

/**
 * GET /exchanges/requests
 * 受信した交換リクエストを取得（要認証）
 */
exchanges.get('/requests', authMiddleware, async (c) => {
  try {
    const currentUser = getCurrentUser(c);

    // 受信した交換リクエストを取得
    const requestsResult = await c.env.DB.prepare(`
      SELECT 
        er.id,
        er.from_user_id,
        er.card_id,
        er.message,
        er.status,
        er.created_at,
        er.expires_at,
        u.name as from_user_name,
        c.card_name
      FROM exchange_requests er
      JOIN users u ON er.from_user_id = u.id
      JOIN cards c ON er.card_id = c.id
      WHERE er.to_user_id = ?
        AND er.status = 'pending'
        AND er.expires_at > datetime('now')
      ORDER BY er.created_at DESC
    `).bind(currentUser.userId).all();

    const requests = requestsResult.results.map((request: any) => ({
      id: request.id,
      fromUser: {
        id: request.from_user_id,
        name: request.from_user_name || '匿名ユーザー',
      },
      card: {
        id: request.card_id,
        name: request.card_name,
      },
      message: request.message,
      status: request.status,
      createdAt: request.created_at,
      expiresAt: request.expires_at,
    }));

    return c.json({
      success: true,
      data: requests,
    });
  } catch (error) {
    console.error('Get exchange requests error:', error);
    return c.json({
      success: false,
      error: 'Failed to get exchange requests',
    }, 500);
  }
});

/**
 * POST /exchanges/requests/:id/respond
 * 交換リクエストに応答（承認/拒否）（要認証）
 */
exchanges.post('/requests/:id/respond', authMiddleware, async (c) => {
  try {
    const currentUser = getCurrentUser(c);
    const requestId = c.req.param('id');
    const body = await c.req.json();
    const { action, myCardId, memo, location_name, latitude, longitude } = body;

    // バリデーション
    if (!['accept', 'reject'].includes(action)) {
      return c.json({
        success: false,
        error: 'Action must be either "accept" or "reject"',
      }, 400);
    }

    if (action === 'accept' && !myCardId) {
      return c.json({
        success: false,
        error: 'Your card ID is required when accepting',
      }, 400);
    }

    // 交換リクエストを取得
    const request = await c.env.DB.prepare(
      'SELECT * FROM exchange_requests WHERE id = ? AND to_user_id = ? AND status = "pending" AND expires_at > datetime("now")'
    ).bind(requestId, currentUser.userId).first() as any;

    if (!request) {
      return c.json({
        success: false,
        error: 'Exchange request not found or expired',
      }, 404);
    }

    if (action === 'reject') {
      // リクエストを拒否
      await c.env.DB.prepare(
        'UPDATE exchange_requests SET status = "rejected" WHERE id = ?'
      ).bind(requestId).run();

      return c.json({
        success: true,
        message: 'Exchange request rejected',
      });
    }

    // 承認の場合
    // 自分のカードを確認
    const myCard = await c.env.DB.prepare(
      'SELECT id, user_id, card_name FROM cards WHERE id = ? AND user_id = ?'
    ).bind(myCardId, currentUser.userId).first() as Card | null;

    if (!myCard) {
      return c.json({
        success: false,
        error: 'Your card not found or not owned by you',
      }, 404);
    }

    // 相手のカードを確認
    const otherCard = await c.env.DB.prepare(
      'SELECT id, user_id, card_name FROM cards WHERE id = ?'
    ).bind(request.card_id).first() as Card | null;

    if (!otherCard) {
      return c.json({
        success: false,
        error: 'Requested card not found',
      }, 404);
    }

    // 相互交換を実行
    const exchangeId1 = crypto.randomUUID();
    const exchangeId2 = crypto.randomUUID();

    // 現在のユーザーが相手のカードをコレクション
    await c.env.DB.prepare(
      'INSERT INTO exchanges (id, owner_user_id, collected_card_id, memo, location_name, latitude, longitude) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).bind(
      exchangeId1,
      currentUser.userId,
      otherCard.id,
      memo || `近距離交換で ${otherCard.card_name} を取得`,
      location_name,
      latitude,
      longitude
    ).run();

    // 相手のユーザーが現在のユーザーのカードをコレクション
    await c.env.DB.prepare(
      'INSERT INTO exchanges (id, owner_user_id, collected_card_id, memo, location_name, latitude, longitude) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).bind(
      exchangeId2,
      otherCard.user_id,
      myCard.id,
      `近距離交換で ${myCard.card_name} を取得`,
      location_name,
      latitude,
      longitude
    ).run();

    // リクエストを承認済みに更新
    await c.env.DB.prepare(
      'UPDATE exchange_requests SET status = "accepted" WHERE id = ?'
    ).bind(requestId).run();

    return c.json({
      success: true,
      message: 'Exchange request accepted and cards exchanged',
      data: {
        exchange1: {
          id: exchangeId1,
          collectorUserId: currentUser.userId,
          collectedCard: {
            id: otherCard.id,
            name: otherCard.card_name,
          },
        },
        exchange2: {
          id: exchangeId2,
          collectorUserId: otherCard.user_id,
          collectedCard: {
            id: myCard.id,
            name: myCard.card_name,
          },
        },
      },
    });
  } catch (error) {
    console.error('Respond to exchange request error:', error);
    return c.json({
      success: false,
      error: 'Failed to respond to exchange request',
    }, 500);
  }
});

export default exchanges;
