import { Hono } from 'hono';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import type { HonoEnv, CreateCardRequest, UpdateCardRequest, Card, UploadUrlRequest } from '../types';

const cards = new Hono<HonoEnv>();

/**
 * POST /cards/upload-url
 * R2へ画像をアップロードするための署名付きURLを生成（要認証）
 */
cards.post('/upload-url', authMiddleware, async (c) => {
  try {
    const currentUser = getCurrentUser(c);
    const body: UploadUrlRequest = await c.req.json();
    const { fileName, fileSize, contentType } = body;

    // バリデーション
    if (!fileName || !fileSize) {
      return c.json({
        success: false,
        error: 'fileName and fileSize are required',
      }, 400);
    }

    // ファイルサイズ制限 (10MB)
    const maxFileSize = 10 * 1024 * 1024; // 10MB
    if (fileSize > maxFileSize) {
      return c.json({
        success: false,
        error: 'File size too large. Maximum size is 10MB.',
      }, 400);
    }

    // 許可されたファイル形式
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (contentType && !allowedTypes.includes(contentType)) {
      return c.json({
        success: false,
        error: 'Invalid file type. Only JPEG, PNG, GIF, and WebP are allowed.',
      }, 400);
    }

    // ファイル拡張子を取得
    const fileExtension = fileName.split('.').pop()?.toLowerCase() || '';
    if (!['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(fileExtension)) {
      return c.json({
        success: false,
        error: 'Invalid file extension. Only .jpg, .jpeg, .png, .gif, and .webp are allowed.',
      }, 400);
    }

    // ユニークなファイルキーを生成
    const timestamp = Date.now();
    const randomId = crypto.randomUUID().split('-')[0];
    const fileKey = `cards/${currentUser.userId}/${timestamp}-${randomId}.${fileExtension}`;

    // R2への直接アップロードURLを生成
    // Cloudflare R2では、Workers環境でのアップロードは直接的に行う
    // クライアントから直接R2にアップロードする場合は、署名付きURLが必要だが、
    // ここではWorkers経由でのアップロードフローを想定
    
    return c.json({
      success: true,
      data: {
        fileKey,
        maxFileSize,
        allowedTypes,
        expiresIn: 3600, // 1時間
        message: 'Use this fileKey to upload via POST /cards endpoint',
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
 * POST /cards/upload
 * 画像ファイルを直接R2にアップロード（要認証）
 */
cards.post('/upload', authMiddleware, async (c) => {
  try {
    const currentUser = getCurrentUser(c);
    
    // multipart/form-data からファイルを取得
    const formData = await c.req.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      return c.json({
        success: false,
        error: 'No file provided',
      }, 400);
    }

    // ファイルサイズ制限 (10MB)
    const maxFileSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxFileSize) {
      return c.json({
        success: false,
        error: 'File size too large. Maximum size is 10MB.',
      }, 400);
    }

    // 許可されたファイル形式
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      return c.json({
        success: false,
        error: 'Invalid file type. Only JPEG, PNG, GIF, and WebP are allowed.',
      }, 400);
    }

    // ファイル拡張子を取得
    const fileExtension = file.name.split('.').pop()?.toLowerCase() || '';
    if (!['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(fileExtension)) {
      return c.json({
        success: false,
        error: 'Invalid file extension. Only .jpg, .jpeg, .png, .gif, and .webp are allowed.',
      }, 400);
    }

    // ユニークなファイルキーを生成
    const timestamp = Date.now();
    const randomId = crypto.randomUUID().split('-')[0];
    const fileKey = `cards/${currentUser.userId}/${timestamp}-${randomId}.${fileExtension}`;

    // ファイルをArrayBufferに変換
    const arrayBuffer = await file.arrayBuffer();
    
    // R2にファイルをアップロード
    await c.env.R2.put(fileKey, arrayBuffer, {
      httpMetadata: {
        contentType: file.type,
        cacheControl: 'public, max-age=31536000', // 1年間キャッシュ
      },
      customMetadata: {
        'uploaded-by': currentUser.userId,
        'original-name': file.name,
        'upload-timestamp': timestamp.toString(),
      },
    });

    // アップロード成功時のレスポンス
    return c.json({
      success: true,
      data: {
        fileKey,
        originalName: file.name,
        size: file.size,
        type: file.type,
        uploadedAt: new Date(timestamp).toISOString(),
      },
    }, 201);
  } catch (error) {
    console.error('Upload file error:', error);
    return c.json({
      success: false,
      error: 'Failed to upload file',
    }, 500);
  }
});

/**
 * GET /cards/image/*
 * R2から画像を取得してレスポンス（公開用）
 */
cards.get('/image/*', async (c) => {
  try {
    // パスから画像キーを取得
    const imageKey = c.req.path.replace('/cards/image/', '');
    
    if (!imageKey || !imageKey.startsWith('cards/')) {
      return c.json({
        success: false,
        error: 'Invalid image key',
      }, 400);
    }

    // R2からファイルを取得
    const object = await c.env.R2.get(imageKey);
    
    if (!object) {
      return c.json({
        success: false,
        error: 'Image not found',
      }, 404);
    }

    // ファイルのメタデータを取得
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('etag', object.httpEtag);
    headers.set('cache-control', 'public, max-age=31536000'); // 1年間キャッシュ

    // 画像をレスポンスとして返す
    return new Response(object.body, {
      headers,
    });
  } catch (error) {
    console.error('Get image error:', error);
    return c.json({
      success: false,
      error: 'Failed to get image',
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

    const imageUrl = createdCard.image_key ? `/cards/image/${createdCard.image_key}` : null;

    return c.json({
      success: true,
      data: {
        ...createdCard,
        links: createdCard.links ? JSON.parse(createdCard.links) : null,
        imageUrl,
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

    const cardsWithParsedLinks = userCards.results.map((card: any) => {
      const imageUrl = card.image_key ? `/cards/image/${card.image_key}` : null;

      return {
        ...card,
        links: card.links ? JSON.parse(card.links) : null,
        imageUrl,
      };
    });

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

    const imageUrl = updatedCard.image_key ? `/cards/image/${updatedCard.image_key}` : null;

    return c.json({
      success: true,
      data: {
        ...updatedCard,
        links: updatedCard.links ? JSON.parse(updatedCard.links) : null,
        imageUrl,
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
