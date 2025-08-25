import { Hono } from 'hono';
import { hashPassword, verifyPassword, generateJWT, generateEmailVerificationToken, verifyEmailVerificationToken } from '../utils/auth';
import { sendVerificationEmail } from '../utils/email';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import type { HonoEnv, RegisterRequest, LoginRequest, VerifyEmailRequest, User } from '../types';

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
    if (!email || !name || !password) {
      return c.json({
        success: false,
        error: 'Email, name, and password are required',
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
    ).bind(userId, email, name, hashedPassword).run();

    // メール認証トークンを生成
    const verificationToken = generateEmailVerificationToken(userId, c.env.JWT_SECRET);

    // 認証メールを送信
    const emailSent = await sendVerificationEmail(email, verificationToken, c.env.MAILCHANNELS_API_KEY);
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

    // メール認証チェック（オプション）
    if (!user.email_verified) {
      return c.json({
        success: false,
        error: 'Please verify your email address before logging in',
      }, 403);
    }

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

export default auth;
