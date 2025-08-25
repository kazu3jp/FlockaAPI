import { Hono } from 'hono';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import type { HonoEnv, CreateCardRequest, UpdateCardRequest, Card } from '../types';

const cards = new Hono<HonoEnv>();

/**
 * POST /cards/upload-url
 * R2へ画像をアップロードするための署名付きURLを生成（要認証）
 */
cards.post('/upload-url', authMiddleware, async (c) => {
  try {
    const currentUser = getCurrentUser(c);
    
    // ファイル名を生成（ユーザーIDと現在時刻を組み合わせ）
    const timestamp = Date.now();
    const fileKey = `cards/${currentUser.userId}/${timestamp}`;

    // 実際の実装では、R2の署名付きURLを生成する
    // ここでは簡易的な実装として、キーのみを返す
    const uploadUrl = `https://your-r2-bucket.r2.cloudflarestorage.com/${fileKey}`;

    return c.json({
      success: true,
      data: {
        uploadUrl,
        fileKey,
        expiresIn: 3600, // 1時間
      },
    });
  } catch (error) {
    console.error('Generate upload URL error:', error);
    return c.json({
      success: false,
      error: 'Failed to generate upload URL',
    }, 500);
  }
});

/**
 * POST /cards
 * 新しいプロフィールカードを作成（要認証）
 */
cards.post('/', authMiddleware, async (c) => {
  try {
    const currentUser = getCurrentUser(c);
    const body: CreateCardRequest = await c.req.json();
    const { card_name, image_key, links } = body;

    // バリデーション
    if (!card_name) {
      return c.json({
        success: false,
        error: 'Card name is required',
      }, 400);
    }

    // linksをJSON文字列に変換
    const linksJson = links ? JSON.stringify(links) : null;

    // カードをデータベースに保存
    const cardId = crypto.randomUUID();
    await c.env.DB.prepare(
      'INSERT INTO cards (id, user_id, card_name, image_key, links) VALUES (?, ?, ?, ?, ?)'
    ).bind(cardId, currentUser.userId, card_name, image_key || null, linksJson).run();

    // 作成されたカードを取得
    const createdCard = await c.env.DB.prepare(
      'SELECT * FROM cards WHERE id = ?'
    ).bind(cardId).first() as Card;

    return c.json({
      success: true,
      data: {
        ...createdCard,
        links: createdCard.links ? JSON.parse(createdCard.links) : null,
      },
    }, 201);
  } catch (error) {
    console.error('Create card error:', error);
    return c.json({
      success: false,
      error: 'Failed to create card',
    }, 500);
  }
});

/**
 * GET /cards
 * 自分が作成したカードの一覧を取得（要認証）
 */
cards.get('/', authMiddleware, async (c) => {
  try {
    const currentUser = getCurrentUser(c);

    // ユーザーのカード一覧を取得
    const userCards = await c.env.DB.prepare(
      'SELECT * FROM cards WHERE user_id = ? ORDER BY created_at DESC'
    ).bind(currentUser.userId).all();

    const cardsWithParsedLinks = userCards.results.map((card: any) => ({
      ...card,
      links: card.links ? JSON.parse(card.links) : null,
    }));

    return c.json({
      success: true,
      data: cardsWithParsedLinks,
    });
  } catch (error) {
    console.error('Get cards error:', error);
    return c.json({
      success: false,
      error: 'Failed to get cards',
    }, 500);
  }
});

/**
 * PUT /cards/:id
 * 既存のカード情報を更新（要認証）
 */
cards.put('/:id', authMiddleware, async (c) => {
  try {
    const currentUser = getCurrentUser(c);
    const cardId = c.req.param('id');
    const body: UpdateCardRequest = await c.req.json();
    const { card_name, image_key, links } = body;

    // カードの存在確認と所有者チェック
    const existingCard = await c.env.DB.prepare(
      'SELECT id, user_id FROM cards WHERE id = ?'
    ).bind(cardId).first() as Card | null;

    if (!existingCard) {
      return c.json({
        success: false,
        error: 'Card not found',
      }, 404);
    }

    if (existingCard.user_id !== currentUser.userId) {
      return c.json({
        success: false,
        error: 'You are not authorized to update this card',
      }, 403);
    }

    // 更新フィールドを準備
    const updates: string[] = [];
    const values: any[] = [];

    if (card_name !== undefined) {
      updates.push('card_name = ?');
      values.push(card_name);
    }

    if (image_key !== undefined) {
      updates.push('image_key = ?');
      values.push(image_key);
    }

    if (links !== undefined) {
      updates.push('links = ?');
      values.push(links ? JSON.stringify(links) : null);
    }

    if (updates.length === 0) {
      return c.json({
        success: false,
        error: 'No fields to update',
      }, 400);
    }

    // カードを更新
    values.push(cardId);
    await c.env.DB.prepare(
      `UPDATE cards SET ${updates.join(', ')} WHERE id = ?`
    ).bind(...values).run();

    // 更新されたカードを取得
    const updatedCard = await c.env.DB.prepare(
      'SELECT * FROM cards WHERE id = ?'
    ).bind(cardId).first() as Card;

    return c.json({
      success: true,
      data: {
        ...updatedCard,
        links: updatedCard.links ? JSON.parse(updatedCard.links) : null,
      },
    });
  } catch (error) {
    console.error('Update card error:', error);
    return c.json({
      success: false,
      error: 'Failed to update card',
    }, 500);
  }
});

/**
 * DELETE /cards/:id
 * カードを削除（要認証）
 */
cards.delete('/:id', authMiddleware, async (c) => {
  try {
    const currentUser = getCurrentUser(c);
    const cardId = c.req.param('id');

    // カードの存在確認と所有者チェック
    const existingCard = await c.env.DB.prepare(
      'SELECT id, user_id, image_key FROM cards WHERE id = ?'
    ).bind(cardId).first() as Card | null;

    if (!existingCard) {
      return c.json({
        success: false,
        error: 'Card not found',
      }, 404);
    }

    if (existingCard.user_id !== currentUser.userId) {
      return c.json({
        success: false,
        error: 'You are not authorized to delete this card',
      }, 403);
    }

    // R2からファイルを削除
    if (existingCard.image_key) {
      try {
        await c.env.R2.delete(existingCard.image_key);
      } catch (r2Error) {
        console.warn('Failed to delete file from R2:', r2Error);
        // R2の削除に失敗してもDBからは削除を続行
      }
    }

    // データベースからカードを削除
    await c.env.DB.prepare(
      'DELETE FROM cards WHERE id = ?'
    ).bind(cardId).run();

    return c.json({
      success: true,
      message: 'Card deleted successfully',
    });
  } catch (error) {
    console.error('Delete card error:', error);
    return c.json({
      success: false,
      error: 'Failed to delete card',
    }, 500);
  }
});

export default cards;
