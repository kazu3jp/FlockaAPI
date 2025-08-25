import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { JWTPayload } from '../types';

/**
 * パスワードをハッシュ化する
 */
export async function hashPassword(password: string): Promise<string> {
  const saltRounds = 12;
  return await bcrypt.hash(password, saltRounds);
}

/**
 * パスワードを検証する
 */
export async function verifyPassword(password: string, hashedPassword: string): Promise<boolean> {
  return await bcrypt.compare(password, hashedPassword);
}

/**
 * JWTトークンを生成する
 */
export function generateJWT(payload: Omit<JWTPayload, 'exp'>, secret: string): string {
  const expiresIn = '7d'; // 7日間有効
  return jwt.sign(payload, secret, { expiresIn });
}

/**
 * JWTトークンを検証する
 */
export function verifyJWT(token: string, secret: string): JWTPayload | null {
  try {
    return jwt.verify(token, secret) as JWTPayload;
  } catch (error) {
    return null;
  }
}

/**
 * メール認証トークンを生成する
 */
export function generateEmailVerificationToken(userId: string, secret: string): string {
  const payload = {
    userId,
    purpose: 'email_verification',
  };
  return jwt.sign(payload, secret, { expiresIn: '24h' });
}

/**
 * メール認証トークンを検証する
 */
export function verifyEmailVerificationToken(token: string, secret: string): { userId: string } | null {
  try {
    const payload = jwt.verify(token, secret) as any;
    if (payload.purpose === 'email_verification') {
      return { userId: payload.userId };
    }
    return null;
  } catch (error) {
    return null;
  }
}

/**
 * R2用の署名付きURLを生成する（アップロード用）
 */
export async function generateUploadURL(r2: R2Bucket, key: string): Promise<string> {
  // 24時間有効な署名付きURLを生成
  const url = await r2.createMultipartUpload(key);
  return url.uploadId; // 実際の実装では適切な署名付きURLを返す
}

/**
 * UUIDを生成する（簡易版）
 */
export function generateId(): string {
  return crypto.randomUUID();
}

/**
 * APIレスポンスを標準化する
 */
export function createResponse<T>(data: T, status: number = 200) {
  return Response.json({
    success: true,
    data,
  }, { status });
}

/**
 * エラーレスポンスを生成する
 */
export function createErrorResponse(error: string, status: number = 400) {
  return Response.json({
    success: false,
    error,
  }, { status });
}

/**
 * バリデーションエラーレスポンスを生成する
 */
export function createValidationErrorResponse(errors: string[]) {
  return Response.json({
    success: false,
    error: 'Validation failed',
    details: errors,
  }, { status: 400 });
}
