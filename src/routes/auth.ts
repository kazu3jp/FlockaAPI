import { Hono } from 'hono';
import { hashPassword, verifyPassword, generateJWT, generateEmailVerificationToken, verifyEmailVerificationToken } from '../utils/auth';
import { sendVerificationEmail } from '../utils/email';
import { validateUserName } from '../utils/validation';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import type { HonoEnv, RegisterRequest, LoginRequest, VerifyEmailRequest, ForgotPasswordRequest, ResetPasswordRequest, User } from '../types';

const auth = new Hono<HonoEnv>();

/**
 * POST /auth/register
 * 新規ユーザー登録
 */
auth.post('/register', async (c) => {
  try {
    const body: RegisterRequest = await c.req.json();
    const { email, name, password } = body;

    // バリデーション
    if (!email || !password) {
      return c.json({
        success: false,
        error: 'Email and password are required',
      }, 400);
    }

    if (!validateUserName(name)) {
      return c.json({
        success: false,
        error: 'Name must be a valid string (max 100 characters)',
      }, 400);
    }

    if (password.length < 8) {
      return c.json({
        success: false,
        error: 'Password must be at least 8 characters long',
      }, 400);
    }

    // メールアドレスの重複チェック
    const existingUser = await c.env.DB.prepare(
      'SELECT id FROM users WHERE email = ?'
    ).bind(email).first();

    if (existingUser) {
      return c.json({
        success: false,
        error: 'Email already exists',
      }, 409);
    }

    // パスワードをハッシュ化
    const hashedPassword = await hashPassword(password);

    // ユーザーをデータベースに保存
    const userId = crypto.randomUUID();
    await c.env.DB.prepare(
      'INSERT INTO users (id, email, name, hashed_password) VALUES (?, ?, ?, ?)'
    ).bind(userId, email, name || null, hashedPassword).run();

    // メール認証トークンを生成
    const verificationToken = generateEmailVerificationToken(userId, c.env.JWT_SECRET);

    // 認証メールを送信
    const baseUrl = 'https://api.flocka.net';
    const emailSent = await sendVerificationEmail(email, verificationToken, c.env.MAILCHANNELS_API_KEY, baseUrl);
    if (!emailSent) {
      // メール送信に失敗してもユーザー作成は成功とする
      console.warn('Failed to send verification email to:', email);
    }

    return c.json({
      success: true,
      message: 'User registered successfully. Please check your email for verification.',
      data: {
        userId,
        email,
        name,
        emailSent,
      },
    }, 201);
  } catch (error) {
    console.error('Registration error:', error);
    return c.json({
      success: false,
      error: 'Registration failed',
    }, 500);
  }
});

/**
 * POST /auth/login
 * ログイン
 */
auth.post('/login', async (c) => {
  try {
    const body: LoginRequest = await c.req.json();
    const { email, password } = body;

    // バリデーション
    if (!email || !password) {
      return c.json({
        success: false,
        error: 'Email and password are required',
      }, 400);
    }

    // ユーザーを検索
    const user = await c.env.DB.prepare(
      'SELECT id, email, name, hashed_password, email_verified FROM users WHERE email = ?'
    ).bind(email).first() as User | null;

    if (!user) {
      return c.json({
        success: false,
        error: 'Invalid email or password',
      }, 401);
    }

    // パスワードを検証
    const isPasswordValid = await verifyPassword(password, user.hashed_password);
    if (!isPasswordValid) {
      return c.json({
        success: false,
        error: 'Invalid email or password',
      }, 401);
    }

    // メール認証チェック（開発用：警告のみ）
    // 本番環境では認証必須にすることを推奨
    // if (!user.email_verified) {
    //   return c.json({
    //     success: false,
    //     error: 'Please verify your email address before logging in',
    //   }, 403);
    // }

    // JWTトークンを生成
    const token = generateJWT(
      { userId: user.id, email: user.email },
      c.env.JWT_SECRET
    );

    return c.json({
      success: true,
      data: {
        token,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          email_verified: user.email_verified, // メール認証状態をフロントエンドに送信
        },
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    return c.json({
      success: false,
      error: 'Login failed',
    }, 500);
  }
});

/**
 * POST /auth/verify-email
 * メール認証
 */
auth.post('/verify-email', async (c) => {
  try {
    const body: VerifyEmailRequest = await c.req.json();
    const { token } = body;

    if (!token) {
      return c.json({
        success: false,
        error: 'Verification token is required',
      }, 400);
    }

    // トークンを検証
    const payload = verifyEmailVerificationToken(token, c.env.JWT_SECRET);
    if (!payload) {
      return c.json({
        success: false,
        error: 'Invalid or expired verification token',
      }, 400);
    }

    // ユーザーのemail_verifiedフラグを更新
    const result = await c.env.DB.prepare(
      'UPDATE users SET email_verified = 1 WHERE id = ?'
    ).bind(payload.userId).run();

    if (result.meta && result.meta.changes === 0) {
      return c.json({
        success: false,
        error: 'User not found',
      }, 404);
    }

    return c.json({
      success: true,
      message: 'Email verified successfully',
    });
  } catch (error) {
    console.error('Email verification error:', error);
    return c.json({
      success: false,
      error: 'Email verification failed',
    }, 500);
  }
});

/**
 * GET /auth/me
 * 現在のユーザー情報を取得（要認証）
 */
auth.get('/me', authMiddleware, async (c) => {
  try {
    const currentUser = getCurrentUser(c);

    // ユーザー情報を取得
    const user = await c.env.DB.prepare(
      'SELECT id, email, name, email_verified, created_at FROM users WHERE id = ?'
    ).bind(currentUser.userId).first() as User | null;

    if (!user) {
      return c.json({
        success: false,
        error: 'User not found',
      }, 404);
    }

    return c.json({
      success: true,
      data: {
        id: user.id,
        email: user.email,
        name: user.name,
        email_verified: Boolean(user.email_verified),
        created_at: user.created_at,
      },
    });
  } catch (error) {
    console.error('Get user error:', error);
    return c.json({
      success: false,
      error: 'Failed to get user information',
    }, 500);
  }
});

/**
 * DELETE /auth/me
 * ユーザーアカウントを削除（要認証）
 */
auth.delete('/me', authMiddleware, async (c) => {
  try {
    const currentUser = getCurrentUser(c);

    // ユーザーを削除（CASCADE により関連データも削除される）
    const result = await c.env.DB.prepare(
      'DELETE FROM users WHERE id = ?'
    ).bind(currentUser.userId).run();

    if (result.meta && result.meta.changes === 0) {
      return c.json({
        success: false,
        error: 'User not found',
      }, 404);
    }

    return c.json({
      success: true,
      message: 'Account deleted successfully',
    });
  } catch (error) {
    console.error('Delete user error:', error);
    return c.json({
      success: false,
      error: 'Failed to delete account',
    }, 500);
  }
});

/**
 * GET /auth/verify
 * メール認証ページ（ブラウザでアクセス）
 */
auth.get('/verify', async (c) => {
  try {
    const token = c.req.query('token');

    if (!token) {
      return c.html(`
        <!DOCTYPE html>
        <html lang="ja">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Flocka - メール認証エラー</title>
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
            <h1 class="error">認証エラー</h1>
            <p>認証トークンが見つかりません。メールのリンクを再度確認してください。</p>
          </div>
        </body>
        </html>
      `);
    }

    // トークンを検証
    const payload = verifyEmailVerificationToken(token, c.env.JWT_SECRET);
    if (!payload) {
      return c.html(`
        <!DOCTYPE html>
        <html lang="ja">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Flocka - メール認証エラー</title>
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
            <h1 class="error">認証エラー</h1>
            <p>認証トークンが無効または期限切れです。新しい認証メールをリクエストしてください。</p>
          </div>
        </body>
        </html>
      `);
    }

    // ユーザーのemail_verifiedフラグを更新
    const result = await c.env.DB.prepare(
      'UPDATE users SET email_verified = 1 WHERE id = ?'
    ).bind(payload.userId).run();

    if (result.meta && result.meta.changes === 0) {
      return c.html(`
        <!DOCTYPE html>
        <html lang="ja">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Flocka - ユーザーが見つかりません</title>
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
            <h1 class="error">エラー</h1>
            <p>ユーザーが見つかりません。</p>
          </div>
        </body>
        </html>
      `);
    }

    // 成功ページを表示
    return c.html(`
      <!DOCTYPE html>
      <html lang="ja">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Flocka - メール認証完了</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
          .container { max-width: 600px; margin: 50px auto; background: white; padding: 40px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); text-align: center; }
          .success { color: #28a745; }
          .logo { font-size: 2em; font-weight: bold; color: #007bff; margin-bottom: 20px; }
          .btn { display: inline-block; background: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; margin: 20px 10px; }
          .btn:hover { background: #0056b3; }
          .btn.secondary { background: #6c757d; }
          .btn.secondary:hover { background: #545b62; }
          .note { font-size: 14px; color: #666; margin-top: 20px; }
          .auto-redirect { font-size: 12px; color: #888; margin-top: 15px; }
        </style>
        <script>
          // 3秒後に自動的にアプリを開く
          setTimeout(function() {
            detectPlatformAndRedirect();
          }, 3000);
          
          // より確実なアプリ起動とフォールバック処理
          function detectPlatformAndRedirect() {
            const userAgent = navigator.userAgent || navigator.vendor || window.opera;
            const startTime = Date.now();
            
            // ページがバックグラウンドに移動したかを検出
            let hasBlurred = false;
            
            function onBlur() {
              hasBlurred = true;
            }
            
            function onFocus() {
              // ページに戻ってきた場合の処理
            }
            
            window.addEventListener('blur', onBlur);
            window.addEventListener('focus', onFocus);
            window.addEventListener('pagehide', onBlur);
            
            // iOS
            if (/iPad|iPhone|iPod/.test(userAgent) && !window.MSStream) {
              // iframeを使った確実な検出
              const iframe = document.createElement('iframe');
              iframe.style.display = 'none';
              iframe.src = 'flockaapp://auth/verified';
              document.body.appendChild(iframe);
              
              setTimeout(function() {
                document.body.removeChild(iframe);
                if (!hasBlurred) {
                  // アプリが開かなかった場合
                  window.location.href = 'https://flocka.net';
                }
              }, 2000);
            }
            // Android
            else if (/android/i.test(userAgent)) {
              // Android Intent
              window.location.href = 'intent://auth/verified#Intent;scheme=flockaapp;package=com.flocka.app;S.browser_fallback_url=https%3A//flocka.net;end';
            }
            // デスクトップ・その他
            else {
              // デスクトップではアプリがないことが多いので、短いタイムアウト
              try {
                window.location.href = 'flockaapp://auth/verified';
              } catch (e) {
                // エラーが発生した場合は直接flocka.netに
                window.location.href = 'https://flocka.net';
                return;
              }
              
              // 500ms後にflocka.netにフォールバック
              setTimeout(function() {
                if (!hasBlurred) {
                  window.location.href = 'https://flocka.net';
                }
              }, 500);
            }
            
            // クリーンアップ用のタイムアウト
            setTimeout(function() {
              window.removeEventListener('blur', onBlur);
              window.removeEventListener('focus', onFocus);
              window.removeEventListener('pagehide', onBlur);
            }, 5000);
          }
        </script>
      </head>
      <body>
        <div class="container">
          <div class="logo">Flocka</div>
          <h1 class="success">✅ メール認証完了！</h1>
          <p>メールアドレスの認証が正常に完了しました。</p>
          <p>これでFlockaアプリにログインできます。</p>
          
          <div class="auto-redirect">
            <strong>3秒後に自動的にアプリを起動します...</strong><br>
            <small>アプリがない場合はflocka.netに移動します</small>
          </div>
          
          <a href="flockaapp://auth/verified" class="btn" onclick="detectPlatformAndRedirect(); return false;">
            📱 アプリを開く
          </a>
          
          <a href="https://flocka.net" class="btn secondary">
            🌐 flocka.netに移動
          </a>
          
          <div class="note">
            <strong>アプリが見つからない場合：</strong><br>
            • 自動的にflocka.netウェブサイトに移動します<br>
            • そこからアプリをダウンロードできます
          </div>
        </div>
      </body>
      </html>
    `);
  } catch (error) {
    console.error('Email verification error:', error);
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
          <p>メール認証の処理中にエラーが発生しました。しばらく時間をおいて再度お試しください。</p>
        </div>
      </body>
      </html>
    `, 500);
  }
});

/**
 * GET /auth/verify-status/:userId
 * メール認証状態の確認（アプリ用）
 */
auth.get('/verify-status/:userId', async (c) => {
  try {
    const userId = c.req.param('userId');

    if (!userId) {
      return c.json({
        success: false,
        error: 'User ID is required',
      }, 400);
    }

    // ユーザーの認証状態を確認
    const user = await c.env.DB.prepare(
      'SELECT id, email, email_verified FROM users WHERE id = ?'
    ).bind(userId).first() as User | null;

    if (!user) {
      return c.json({
        success: false,
        error: 'User not found',
      }, 404);
    }

    return c.json({
      success: true,
      data: {
        userId: user.id,
        email: user.email,
        emailVerified: Boolean(user.email_verified),
      },
    });
  } catch (error) {
    console.error('Verify status check error:', error);
    return c.json({
      success: false,
      error: 'Failed to check verification status',
    }, 500);
  }
});

/**
 * POST /auth/resend-verification
 * メール認証の再送（要認証）
 */
auth.post('/resend-verification', authMiddleware, async (c) => {
  try {
    const currentUser = getCurrentUser(c);

    // ユーザー情報を取得
    const user = await c.env.DB.prepare(
      'SELECT id, email, name, email_verified FROM users WHERE id = ?'
    ).bind(currentUser.userId).first() as User | null;

    if (!user) {
      return c.json({
        success: false,
        error: 'User not found',
      }, 404);
    }

    // 既に確認済みの場合
    if (user.email_verified === 1) {
      return c.json({
        success: false,
        error: 'Email is already verified',
      }, 400);
    }

    // メール認証トークンを生成
    const verificationToken = generateEmailVerificationToken(user.id, c.env.JWT_SECRET);

    // 認証メールを送信
    const emailSent = await sendVerificationEmail(
      user.email,
      verificationToken,
      c.env.MAILCHANNELS_API_KEY,
      c.env.ENVIRONMENT === 'production' ? 'https://api.flocka.net' : 'http://localhost:8787'
    );

    if (!emailSent) {
      return c.json({
        success: false,
        error: 'Failed to send verification email',
      }, 500);
    }

    return c.json({
      success: true,
      message: 'Verification email resent successfully',
      data: {
        email: user.email,
        message: 'Please check your email for verification instructions',
      },
    });
  } catch (error) {
    console.error('Resend verification email error:', error);
    return c.json({
      success: false,
      error: 'Failed to resend verification email',
    }, 500);
  }
});

/**
 * POST /auth/resend-verification-by-email
 * メールアドレスによるメール認証の再送（認証不要）
 */
auth.post('/resend-verification-by-email', async (c) => {
  try {
    const body = await c.req.json();
    const { email } = body;

    // バリデーション
    if (!email) {
      return c.json({
        success: false,
        error: 'Email is required',
      }, 400);
    }

    // ユーザー情報を取得
    const user = await c.env.DB.prepare(
      'SELECT id, email, name, email_verified FROM users WHERE email = ?'
    ).bind(email).first() as User | null;

    if (!user) {
      // セキュリティ上、ユーザーが存在しない場合でも成功レスポンスを返す
      return c.json({
        success: true,
        message: 'If the email exists in our system, a verification email has been sent',
      });
    }

    // 既に確認済みの場合
    if (user.email_verified === 1) {
      return c.json({
        success: true,
        message: 'Email is already verified',
      });
    }

    // メール認証トークンを生成
    const verificationToken = generateEmailVerificationToken(user.id, c.env.JWT_SECRET);

    // 認証メールを送信
    const emailSent = await sendVerificationEmail(
      user.email,
      verificationToken,
      c.env.MAILCHANNELS_API_KEY,
      c.env.ENVIRONMENT === 'production' ? 'https://api.flocka.net' : 'http://localhost:8787'
    );

    // セキュリティ上、メール送信の成否に関わらず成功レスポンスを返す
    return c.json({
      success: true,
      message: 'If the email exists in our system, a verification email has been sent',
    });
  } catch (error) {
    console.error('Resend verification email by email error:', error);
    return c.json({
      success: false,
      error: 'Failed to process request',
    }, 500);
  }
});

/**
 * POST /auth/forgot-password
 * パスワード再設定リクエスト（メール送信）
 */
auth.post('/forgot-password', async (c) => {
  try {
    const body: { email: string } = await c.req.json();
    const { email } = body;

    if (!email) {
      return c.json({
        success: false,
        error: 'Email is required',
      }, 400);
    }

    // ユーザー情報を取得
    const user = await c.env.DB.prepare(
      'SELECT id, email, name FROM users WHERE email = ? AND email_verified = 1'
    ).bind(email).first() as User | null;

    if (!user) {
      // セキュリティ上、ユーザーが存在しない場合でも成功レスポンスを返す
      return c.json({
        success: true,
        message: 'If the email exists in our system, a password reset email has been sent',
      });
    }

    // 既存の未使用トークンを無効化
    await c.env.DB.prepare(
      'UPDATE password_reset_tokens SET used = 1 WHERE user_id = ? AND used = 0'
    ).bind(user.id).run();

    // パスワード再設定トークンを生成
    const resetToken = crypto.randomUUID();
    
    // トークンをデータベースに保存
    await c.env.DB.prepare(
      'INSERT INTO password_reset_tokens (token, user_id, email) VALUES (?, ?, ?)'
    ).bind(resetToken, user.id, user.email).run();

    // パスワード再設定メールを送信
    const baseUrl = c.env.ENVIRONMENT === 'production' ? 'https://api.flocka.net' : 'http://localhost:8787';
    const resetUrl = `${baseUrl}/auth/reset-password?token=${resetToken}`;
    
    const emailHtml = `
      <h2>パスワード再設定のご案内</h2>
      <p>Flockaアカウントのパスワード再設定をリクエストされました。</p>
      <p>以下のリンクをクリックして、新しいパスワードを設定してください：</p>
      <a href="${resetUrl}">パスワードを再設定する</a>
      <p>このリンクは1時間で期限切れになります。</p>
      <p>もしこのメールに心当たりがない場合は、無視してください。</p>
    `;

    try {
      await fetch('https://api.mailchannels.net/tx/v1/send', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${c.env.MAILCHANNELS_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          personalizations: [
            {
              to: [{ email: user.email, name: user.name || 'Flocka User' }],
            },
          ],
          from: {
            email: 'noreply@flocka.net',
            name: 'Flocka',
          },
          subject: 'Flocka - パスワード再設定のご案内',
          content: [
            {
              type: 'text/html',
              value: emailHtml,
            },
          ],
        }),
      });
    } catch (emailError) {
      console.error('Failed to send password reset email:', emailError);
    }

    return c.json({
      success: true,
      message: 'If the email exists in our system, a password reset email has been sent',
    });
  } catch (error) {
    console.error('Forgot password error:', error);
    return c.json({
      success: false,
      error: 'Failed to process password reset request',
    }, 500);
  }
});

/**
 * POST /auth/reset-password
 * パスワード再設定の実行
 */
auth.post('/reset-password', async (c) => {
  try {
    const body: { token: string; newPassword: string } = await c.req.json();
    const { token, newPassword } = body;

    if (!token || !newPassword) {
      return c.json({
        success: false,
        error: 'Token and new password are required',
      }, 400);
    }

    if (newPassword.length < 8) {
      return c.json({
        success: false,
        error: 'Password must be at least 8 characters long',
      }, 400);
    }

    // トークンの有効性を確認
    const resetToken = await c.env.DB.prepare(
      'SELECT * FROM password_reset_tokens WHERE token = ? AND used = 0 AND expires_at > datetime("now")'
    ).bind(token).first() as any;

    if (!resetToken) {
      return c.json({
        success: false,
        error: 'Invalid or expired reset token',
      }, 400);
    }

    // ユーザー情報を取得
    const user = await c.env.DB.prepare(
      'SELECT id, email FROM users WHERE id = ?'
    ).bind(resetToken.user_id).first() as User | null;

    if (!user) {
      return c.json({
        success: false,
        error: 'User not found',
      }, 404);
    }

    // パスワードをハッシュ化
    const hashedPassword = await hashPassword(newPassword);

    // パスワードを更新
    await c.env.DB.prepare(
      'UPDATE users SET hashed_password = ? WHERE id = ?'
    ).bind(hashedPassword, user.id).run();

    // トークンを使用済みにマーク
    await c.env.DB.prepare(
      'UPDATE password_reset_tokens SET used = 1 WHERE token = ?'
    ).bind(token).run();

    return c.json({
      success: true,
      message: 'Password has been reset successfully',
    });
  } catch (error) {
    console.error('Reset password error:', error);
    return c.json({
      success: false,
      error: 'Failed to reset password',
    }, 500);
  }
});

/**
 * GET /auth/reset-password
 * パスワード再設定ページ（HTML）
 */
auth.get('/reset-password', async (c) => {
  const token = c.req.query('token');
  
  if (!token) {
    return c.html(`
      <html>
        <head><title>Flocka - エラー</title></head>
        <body>
          <h1>エラー</h1>
          <p>無効なリクエストです。</p>
        </body>
      </html>
    `, 400);
  }

  // トークンの有効性を確認
  const resetToken = await c.env.DB.prepare(
    'SELECT * FROM password_reset_tokens WHERE token = ? AND used = 0 AND expires_at > datetime("now")'
  ).bind(token).first();

  if (!resetToken) {
    return c.html(`
      <html>
        <head><title>Flocka - トークンエラー</title></head>
        <body>
          <h1>無効なトークン</h1>
          <p>パスワード再設定トークンが無効または期限切れです。</p>
          <p>新しいパスワード再設定リクエストを送信してください。</p>
        </body>
      </html>
    `, 400);
  }

  return c.html(`
    <html>
      <head>
        <title>Flocka - パスワード再設定</title>
        <style>
          body { font-family: Arial, sans-serif; max-width: 400px; margin: 50px auto; padding: 20px; }
          input { width: 100%; padding: 10px; margin: 10px 0; border: 1px solid #ddd; border-radius: 4px; }
          button { width: 100%; padding: 12px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer; }
          button:hover { background: #0056b3; }
          .error { color: red; margin: 10px 0; }
          .success { color: green; margin: 10px 0; }
        </style>
      </head>
      <body>
        <h1>パスワード再設定</h1>
        <form id="resetForm">
          <input type="hidden" id="token" value="${token}">
          <input type="password" id="newPassword" placeholder="新しいパスワード (8文字以上)" required>
          <input type="password" id="confirmPassword" placeholder="パスワード確認" required>
          <button type="submit">パスワードを再設定</button>
        </form>
        <div id="message"></div>
        
        <script>
          document.getElementById('resetForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const token = document.getElementById('token').value;
            const newPassword = document.getElementById('newPassword').value;
            const confirmPassword = document.getElementById('confirmPassword').value;
            const messageDiv = document.getElementById('message');
            
            if (newPassword !== confirmPassword) {
              messageDiv.innerHTML = '<div class="error">パスワードが一致しません。</div>';
              return;
            }
            
            if (newPassword.length < 8) {
              messageDiv.innerHTML = '<div class="error">パスワードは8文字以上で入力してください。</div>';
              return;
            }
            
            try {
              const response = await fetch('/auth/reset-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token, newPassword })
              });
              
              const data = await response.json();
              
              if (data.success) {
                messageDiv.innerHTML = '<div class="success">パスワードが正常に再設定されました。</div>';
                document.getElementById('resetForm').style.display = 'none';
              } else {
                messageDiv.innerHTML = '<div class="error">' + data.error + '</div>';
              }
            } catch (error) {
              messageDiv.innerHTML = '<div class="error">エラーが発生しました。もう一度お試しください。</div>';
            }
          });
        </script>
      </body>
    </html>
  `);
});

export default auth;
