import { Hono } from 'hono';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import type { HonoEnv, CreateCardRequest, UpdateCardRequest, Card, UploadUrlRequest, GenerateQRRequest, ShareCardRequest } from '../types';
import { 
  generateExchangeToken, 
  generateCardExchangeQRData,
  generateCardShareURL,
  validateCardName,
  validateCardLinks,
  validateFileName,
  validateBio
} from '../utils';

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

    if (!validateFileName(fileName)) {
      return c.json({
        success: false,
        error: 'Invalid file name or unsupported file type',
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
    const { card_name, bio, image_key, links } = body;

    // バリデーション
    if (!validateCardName(card_name)) {
      return c.json({
        success: false,
        error: 'Invalid card name. Must be 1-100 characters.',
      }, 400);
    }

    if (bio && !validateBio(bio)) {
      return c.json({
        success: false,
        error: 'Invalid bio. Must be 80 characters or less.',
      }, 400);
    }

    if (links && !validateCardLinks(links)) {
      return c.json({
        success: false,
        error: 'Invalid links. Maximum 4 links allowed with valid URLs.',
      }, 400);
    }

    // linksをJSON文字列に変換
    const linksJson = links ? JSON.stringify(links) : null;

    // カードをデータベースに保存
    const cardId = crypto.randomUUID();
    await c.env.DB.prepare(
      'INSERT INTO cards (id, user_id, card_name, bio, image_key, links) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(cardId, currentUser.userId, card_name, bio || null, image_key || null, linksJson).run();

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
    const { card_name, bio, image_key, links } = body;

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

    // バリデーション
    if (card_name !== undefined && !validateCardName(card_name)) {
      return c.json({
        success: false,
        error: 'Invalid card name. Must be 1-100 characters.',
      }, 400);
    }

    if (bio !== undefined && bio !== null && !validateBio(bio)) {
      return c.json({
        success: false,
        error: 'Invalid bio. Must be 80 characters or less.',
      }, 400);
    }

    if (links !== undefined && links !== null && !validateCardLinks(links)) {
      return c.json({
        success: false,
        error: 'Invalid links. Maximum 4 links allowed with valid URLs.',
      }, 400);
    }

    // 更新フィールドを準備
    const updates: string[] = [];
    const values: any[] = [];

    if (card_name !== undefined) {
      updates.push('card_name = ?');
      values.push(card_name);
    }

    if (bio !== undefined) {
      updates.push('bio = ?');
      values.push(bio || null);
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

/**
 * POST /cards/:id/generate-exchange-url
 * カード交換用のURLを生成（要認証）
 */
cards.post('/:id/generate-exchange-url', authMiddleware, async (c) => {
  try {
    const currentUser = getCurrentUser(c);
    const cardId = c.req.param('id');

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

    // 交換用トークンを生成（24時間有効）
    const exchangeToken = btoa(JSON.stringify({
      cardId: card.id,
      userId: currentUser.userId,
      timestamp: Date.now(),
      expires: Date.now() + (24 * 60 * 60 * 1000) // 24時間
    }));

    // 交換URL生成
    const exchangeUrl = `https://api.flocka.net/cards/exchange?token=${exchangeToken}`;

    return c.json({
      success: true,
      data: {
        exchangeUrl,
        cardId: card.id,
        cardName: card.card_name,
        expiresAt: new Date(Date.now() + (24 * 60 * 60 * 1000)).toISOString(),
      },
    });
  } catch (error) {
    console.error('Generate exchange URL error:', error);
    return c.json({
      success: false,
      error: 'Failed to generate exchange URL',
    }, 500);
  }
});

/**
 * GET /cards/exchange
 * 交換用URLにアクセスした時の処理（ブラウザでアクセス）
 */
cards.get('/exchange', async (c) => {
  try {
    const token = c.req.query('token');

    if (!token) {
      return c.html(`
        <!DOCTYPE html>
        <html lang="ja">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Flocka - カード交換エラー</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
            .container { max-width: 600px; margin: 50px auto; background: white; padding: 40px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); text-align: center; }
            .error { color: #dc3545; }
            .logo { font-size: 2em; font-weight: bold; color: #007bff; margin-bottom: 20px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="logo">Flocka</div>
            <h1 class="error">交換エラー</h1>
            <p>無効な交換URLです。正しいリンクを確認してください。</p>
          </div>
        </body>
        </html>
      `);
    }

    // トークンをデコード
    let tokenData;
    try {
      tokenData = JSON.parse(atob(token));
    } catch (e) {
      return c.html(`
        <!DOCTYPE html>
        <html lang="ja">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Flocka - 無効なトークン</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
            .container { max-width: 600px; margin: 50px auto; background: white; padding: 40px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); text-align: center; }
            .error { color: #dc3545; }
            .logo { font-size: 2em; font-weight: bold; color: #007bff; margin-bottom: 20px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="logo">Flocka</div>
            <h1 class="error">無効なトークン</h1>
            <p>交換トークンが無効です。新しい交換URLを取得してください。</p>
          </div>
        </body>
        </html>
      `);
    }

    // トークン有効期限チェック
    if (Date.now() > tokenData.expires) {
      return c.html(`
        <!DOCTYPE html>
        <html lang="ja">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Flocka - 期限切れ</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
            .container { max-width: 600px; margin: 50px auto; background: white; padding: 40px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); text-align: center; }
            .error { color: #dc3545; }
            .logo { font-size: 2em; font-weight: bold; color: #007bff; margin-bottom: 20px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="logo">Flocka</div>
            <h1 class="error">期限切れ</h1>
            <p>この交換URLは期限切れです。新しい交換URLを取得してください。</p>
          </div>
        </body>
        </html>
      `);
    }

    // カード情報を取得
    const card = await c.env.DB.prepare(
      'SELECT c.id, c.card_name, c.bio, c.image_key, u.name as owner_name FROM cards c JOIN users u ON c.user_id = u.id WHERE c.id = ?'
    ).bind(tokenData.cardId).first() as any;

    if (!card) {
      return c.html(`
        <!DOCTYPE html>
        <html lang="ja">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Flocka - カードが見つかりません</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
            .container { max-width: 600px; margin: 50px auto; background: white; padding: 40px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); text-align: center; }
            .error { color: #dc3545; }
            .logo { font-size: 2em; font-weight: bold; color: #007bff; margin-bottom: 20px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="logo">Flocka</div>
            <h1 class="error">カードが見つかりません</h1>
            <p>指定されたカードは削除されているか存在しません。</p>
          </div>
        </body>
        </html>
      `);
    }

    // カード交換ページを表示
    return c.html(`
      <!DOCTYPE html>
      <html lang="ja">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Flocka - カード交換</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
          .container { max-width: 600px; margin: 50px auto; background: white; padding: 40px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); text-align: center; }
          .logo { font-size: 2em; font-weight: bold; color: #007bff; margin-bottom: 20px; }
          .card-preview { background: #f8f9fa; border-radius: 8px; padding: 20px; margin: 20px 0; }
          .card-name { font-size: 1.5em; font-weight: bold; color: #333; margin-bottom: 10px; }
          .card-bio { color: #666; margin-bottom: 10px; font-style: italic; }
          .owner-name { color: #666; margin-bottom: 20px; }
          .btn { display: inline-block; background: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; margin: 10px; cursor: pointer; border: none; font-size: 16px; }
          .btn:hover { background: #0056b3; }
          .btn.secondary { background: #6c757d; }
          .btn.secondary:hover { background: #545b62; }
          .note { font-size: 14px; color: #666; margin-top: 20px; }
        </style>
        <script>
          function openApp() {
            const token = '${token}';
            const userAgent = navigator.userAgent || navigator.vendor || window.opera;
            
            // iOS
            if (/iPad|iPhone|iPod/.test(userAgent) && !window.MSStream) {
              window.location.href = 'flockaapp://exchange?token=' + encodeURIComponent(token);
              setTimeout(function() {
                window.location.href = 'https://flocka.net';
              }, 1500);
            }
            // Android
            else if (/android/i.test(userAgent)) {
              window.location.href = 'intent://exchange?token=' + encodeURIComponent(token) + '#Intent;scheme=flockaapp;package=com.flocka.app;S.browser_fallback_url=https%3A//flocka.net;end';
            }
            // その他
            else {
              window.location.href = 'https://flocka.net';
            }
          }
        </script>
      </head>
      <body>
        <div class="container">
          <div class="logo">Flocka</div>
          <h1>🎴 カード交換</h1>
          
          <div class="card-preview">
            <div class="card-name">${card.card_name}</div>
            ${card.bio ? `<div class="card-bio">"${card.bio}"</div>` : ''}
            <div class="owner-name">by ${card.owner_name || '匿名ユーザー'}</div>
          </div>
          
          <p>このカードと交換しますか？</p>
          
          <button class="btn" onclick="openApp()">
            📱 アプリで交換する
          </button>
          
          <a href="https://flocka.net" class="btn secondary">
            🌐 flocka.netに移動
          </a>
          
          <div class="note">
            ※ カード交換はFlockaアプリで行います<br>
            ※ 交換後はお互いのカードがコレクションに追加されます
          </div>
        </div>
      </body>
      </html>
    `);
  } catch (error) {
    console.error('Exchange page error:', error);
    return c.html(`
      <!DOCTYPE html>
      <html lang="ja">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Flocka - エラー</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
          .container { max-width: 600px; margin: 50px auto; background: white; padding: 40px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); text-align: center; }
          .error { color: #dc3545; }
          .logo { font-size: 2em; font-weight: bold; color: #007bff; margin-bottom: 20px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="logo">Flocka</div>
          <h1 class="error">エラーが発生しました</h1>
          <p>カード交換の処理中にエラーが発生しました。しばらく時間をおいて再度お試しください。</p>
        </div>
      </body>
      </html>
    `, 500);
  }
});

/**
 * POST /cards/:id/generate-qr
 * QRコード交換用のデータを生成（要認証）
 */
cards.post('/:id/generate-qr', authMiddleware, async (c) => {
  try {
    const currentUser = getCurrentUser(c);
    const cardId = c.req.param('id');

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

    // 交換用トークンを生成
    const exchangeToken = generateExchangeToken();
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30分後

    // トークンをデータベースに保存
    await c.env.DB.prepare(
      'INSERT INTO qr_exchange_tokens (token, user_id, card_id, expires_at) VALUES (?, ?, ?, ?)'
    ).bind(exchangeToken, currentUser.userId, cardId, expiresAt.toISOString()).run();

    // QRコード用のデータを生成
    const qrData = generateCardExchangeQRData(cardId, currentUser.userId, exchangeToken);

    return c.json({
      success: true,
      data: {
        qrData,
        cardId: card.id,
        cardName: card.card_name,
        token: exchangeToken,
        expiresAt: expiresAt.toISOString(),
      },
    });
  } catch (error) {
    console.error('Generate QR error:', error);
    return c.json({
      success: false,
      error: 'Failed to generate QR code',
    }, 500);
  }
});

/**
 * POST /cards/:id/share
 * カード共有用のURLを生成（要認証）
 */
cards.post('/:id/share', authMiddleware, async (c) => {
  try {
    const currentUser = getCurrentUser(c);
    const cardId = c.req.param('id');

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

    // 共有URL生成
    const shareUrl = generateCardShareURL(cardId);
    
    // QR用データ（交換用ではなく閲覧用）
    const qrData = JSON.stringify({
      type: 'card_view',
      cardId: card.id,
      shareUrl,
    });

    return c.json({
      success: true,
      data: {
        shareUrl,
        qrData,
        cardId: card.id,
        cardName: card.card_name,
      },
    });
  } catch (error) {
    console.error('Share card error:', error);
    return c.json({
      success: false,
      error: 'Failed to generate share URL',
    }, 500);
  }
});

/**
 * GET /cards/public/:id
 * 公開カード情報を取得（認証不要）
 */
cards.get('/public/:id', async (c) => {
  try {
    const cardId = c.req.param('id');

    // カード情報を取得（パブリック用）
    const card = await c.env.DB.prepare(`
      SELECT 
        c.id, 
        c.card_name,
        c.bio,
        c.image_key, 
        c.links,
        u.name as owner_name
      FROM cards c 
      JOIN users u ON c.user_id = u.id 
      WHERE c.id = ?
    `).bind(cardId).first() as any;

    if (!card) {
      return c.json({
        success: false,
        error: 'Card not found',
      }, 404);
    }

    const imageUrl = card.image_key ? `/cards/image/${card.image_key}` : null;

    return c.json({
      success: true,
      data: {
        id: card.id,
        card_name: card.card_name,
        bio: card.bio,
        image_url: imageUrl,
        links: card.links ? JSON.parse(card.links) : null,
        owner_name: card.owner_name || '匿名ユーザー',
      },
    });
  } catch (error) {
    console.error('Get public card error:', error);
    return c.json({
      success: false,
      error: 'Failed to get card',
    }, 500);
  }
});

export default cards;
