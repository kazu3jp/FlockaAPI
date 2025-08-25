import { Hono } from 'hono';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import type { HonoEnv, CreateExchangeRequest, UpdateExchangeRequest, Exchange, Card, User } from '../types';

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

    // 位置情報のバリデーション
    if ((latitude !== undefined || longitude !== undefined) && 
        (latitude === undefined || longitude === undefined)) {
      return c.json({
        success: false,
        error: 'Both latitude and longitude must be provided together',
      }, 400);
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
          name: exchange.card_creator_name,
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

    // 位置情報のバリデーション
    if ((latitude !== undefined || longitude !== undefined) && 
        (latitude === undefined || longitude === undefined)) {
      return c.json({
        success: false,
        error: 'Both latitude and longitude must be provided together',
      }, 400);
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
          name: exchangeResult.card_creator_name,
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

export default exchanges;
