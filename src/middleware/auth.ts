import { Context, Next } from 'hono';
import { verifyJWT } from '../utils/auth';
import type { HonoEnv, JWTPayload } from '../types';

/**
 * JWT認証ミドルウェア
 * Authorization: Bearer <token> ヘッダーを検証し、ユーザー情報をコンテキストに追加する
 */
export async function authMiddleware(c: Context<HonoEnv>, next: Next) {
  try {
    // Authorizationヘッダーからトークンを取得
    const authorization = c.req.header('Authorization');
    if (!authorization || !authorization.startsWith('Bearer ')) {
      return c.json({
        success: false,
        error: 'Authorization header is missing or invalid',
      }, 401);
    }

    const token = authorization.slice(7); // "Bearer " を除去
    const jwtSecret = c.env.JWT_SECRET;

    // JWTトークンを検証
    const payload = verifyJWT(token, jwtSecret);
    if (!payload) {
      return c.json({
        success: false,
        error: 'Invalid or expired token',
      }, 401);
    }

    // ユーザー情報をコンテキストに設定
    c.set('user', payload);
    
    return await next();
  } catch (error) {
    return c.json({
      success: false,
      error: 'Authentication failed',
    }, 401);
  }
}

/**
 * コンテキストからユーザー情報を取得するヘルパー関数
 */
export function getCurrentUser(c: Context): JWTPayload {
  const user = c.get('user');
  if (!user) {
    throw new Error('User not authenticated');
  }
  return user as JWTPayload;
}

/**
 * CORS ミドルウェア
 */
export async function corsMiddleware(c: Context, next: Next) {
  // プリフライトリクエストの処理
  if (c.req.method === 'OPTIONS') {
    return c.json({}, 200, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
    });
  }

  await next();

  // レスポンスヘッダーにCORSを追加
  c.res.headers.set('Access-Control-Allow-Origin', '*');
  c.res.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  c.res.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  return;
}

/**
 * エラーハンドリングミドルウェア
 */
export async function errorMiddleware(c: Context, next: Next) {
  try {
    await next();
  } catch (error) {
    console.error('Unhandled error:', error);
    
    return c.json({
      success: false,
      error: 'Internal server error',
    }, 500);
  }
  
  return;
}

/**
 * リクエストログミドルウェア
 */
export async function loggerMiddleware(c: Context, next: Next) {
  const start = Date.now();
  const method = c.req.method;
  const url = c.req.url;

  await next();

  const end = Date.now();
  const status = c.res.status;
  const duration = end - start;

  console.log(`${method} ${url} ${status} ${duration}ms`);
  
  return;
}
