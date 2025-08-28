import { Hono } from 'hono';
import type { HonoEnv } from '../types';

const cleanup = new Hono<HonoEnv>();

/**
 * POST /cleanup/expired-tokens
 * 期限切れのトークンと位置情報をクリーンアップ
 */
cleanup.post('/expired-tokens', async (c) => {
  try {
    // 期限切れのQRトークンを削除
    const qrTokenCleanup = await c.env.DB.prepare(
      'DELETE FROM qr_exchange_tokens WHERE expires_at <= datetime("now")'
    ).run();

    // 期限切れの位置情報を削除
    const locationCleanup = await c.env.DB.prepare(
      'DELETE FROM user_locations WHERE expires_at <= datetime("now")'
    ).run();

    // 期限切れの交換リクエストを更新
    const requestCleanup = await c.env.DB.prepare(
      'UPDATE exchange_requests SET status = "expired" WHERE expires_at <= datetime("now") AND status = "pending"'
    ).run();

    return c.json({
      success: true,
      message: 'Cleanup completed successfully',
      data: {
        qrTokensDeleted: qrTokenCleanup.meta?.changes || 0,
        locationsDeleted: locationCleanup.meta?.changes || 0,
        requestsExpired: requestCleanup.meta?.changes || 0,
      },
    });
  } catch (error) {
    console.error('Cleanup error:', error);
    return c.json({
      success: false,
      error: 'Failed to perform cleanup',
    }, 500);
  }
});

/**
 * GET /cleanup/stats
 * クリーンアップ統計情報を取得
 */
cleanup.get('/stats', async (c) => {
  try {
    // 期限切れのデータ数を取得
    const expiredQRTokens = await c.env.DB.prepare(
      'SELECT COUNT(*) as count FROM qr_exchange_tokens WHERE expires_at <= datetime("now")'
    ).first() as any;

    const expiredLocations = await c.env.DB.prepare(
      'SELECT COUNT(*) as count FROM user_locations WHERE expires_at <= datetime("now")'
    ).first() as any;

    const expiredRequests = await c.env.DB.prepare(
      'SELECT COUNT(*) as count FROM exchange_requests WHERE expires_at <= datetime("now") AND status = "pending"'
    ).first() as any;

    // アクティブなデータ数を取得
    const activeQRTokens = await c.env.DB.prepare(
      'SELECT COUNT(*) as count FROM qr_exchange_tokens WHERE expires_at > datetime("now")'
    ).first() as any;

    const activeLocations = await c.env.DB.prepare(
      'SELECT COUNT(*) as count FROM user_locations WHERE expires_at > datetime("now")'
    ).first() as any;

    const activeRequests = await c.env.DB.prepare(
      'SELECT COUNT(*) as count FROM exchange_requests WHERE expires_at > datetime("now") AND status = "pending"'
    ).first() as any;

    return c.json({
      success: true,
      data: {
        expired: {
          qrTokens: expiredQRTokens?.count || 0,
          locations: expiredLocations?.count || 0,
          requests: expiredRequests?.count || 0,
        },
        active: {
          qrTokens: activeQRTokens?.count || 0,
          locations: activeLocations?.count || 0,
          requests: activeRequests?.count || 0,
        },
      },
    });
  } catch (error) {
    console.error('Get cleanup stats error:', error);
    return c.json({
      success: false,
      error: 'Failed to get cleanup stats',
    }, 500);
  }
});

export default cleanup;
