// Cloudflare Workers環境の型定義

export interface Env {
  DB: D1Database;
  R2: R2Bucket;
  JWT_SECRET: string;
  ENVIRONMENT: string;
  MAILCHANNELS_API_KEY: string;
  [key: string]: unknown;
}

export interface HonoEnv {
  Bindings: Env;
  Variables: {
    user?: JWTPayload;
  };
}

// データベーステーブルの型定義
export interface User {
  id: string;
  email: string;
  name?: string; // null許容に変更
  hashed_password: string;
  email_verified: number;
  created_at: string;
}

export interface Card {
  id: string;
  user_id: string;
  card_name: string;
  bio?: string; // 80文字制限の自己紹介
  image_key?: string;
  links?: string; // JSON文字列
  created_at: string;
}

export interface Exchange {
  id: string;
  owner_user_id: string;
  collected_card_id: string;
  memo?: string;
  location_name?: string;
  latitude?: number;
  longitude?: number;
  created_at: string;
}

export interface QRExchangeLog {
  id: string;
  qr_owner_user_id: string;
  scanner_user_id: string;
  scanner_card_id: string;
  qr_card_id: string;
  memo?: string;
  location_name?: string;
  latitude?: number;
  longitude?: number;
  notified: number;
  created_at: string;
}

export interface PasswordResetToken {
  token: string;
  user_id: string;
  email: string;
  created_at: string;
  expires_at: string;
  used: number;
}

// APIリクエスト/レスポンスの型定義
export interface RegisterRequest {
  email: string;
  name?: string; // オプショナルに変更
  password: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface VerifyEmailRequest {
  token: string;
}

export interface ResendVerificationRequest {
  email: string;
}

export interface ForgotPasswordRequest {
  email: string;
}

export interface ResetPasswordRequest {
  token: string;
  newPassword: string;
}

export interface CreateCardRequest {
  card_name: string;
  bio?: string; // 80文字制限の自己紹介
  image_key?: string;
  links?: Array<{
    title: string;
    url: string;
  }>;
}

export interface UploadUrlRequest {
  fileName: string;
  fileSize: number;
  contentType?: string;
}

export interface UpdateCardRequest {
  card_name?: string;
  bio?: string; // 80文字制限の自己紹介
  image_key?: string;
  links?: Array<{
    title: string;
    url: string;
  }>;
}

export interface CreateExchangeRequest {
  collected_card_id: string;
  memo?: string;
  location_name?: string;
  latitude?: number;
  longitude?: number;
}

export interface UpdateExchangeRequest {
  memo?: string;
  location_name?: string;
  latitude?: number;
  longitude?: number;
}

export interface MutualExchangeRequest {
  exchangeToken: string;
  myCardId: string;
  memo?: string;
  location_name?: string;
  latitude?: number;
  longitude?: number;
}

// QRコード交換関連
export interface QRExchangeRequest {
  qrData: string;
  myCardId: string;
  memo?: string;
  location_name?: string;
  latitude?: number;
  longitude?: number;
}

export interface GenerateQRRequest {
  cardId: string;
}

export interface QRExchangeData {
  type: 'card_exchange';
  cardId: string;
  userId: string;
  token: string;
  timestamp: number;
}

// 近距離交換関連（BLE用）- アプリで完結
export interface SendExchangeRequestParams {
  targetUserId: string;
  cardId: string;
  message?: string;
}

export interface ExchangeRequestResponse {
  id: string;
  fromUserId: string;
  toUserId: string;
  cardId: string;
  message?: string;
  status: 'pending' | 'accepted' | 'rejected' | 'expired';
  created_at: string;
}

// URL共有関連
export interface ShareCardRequest {
  cardId: string;
}

export interface ShareCardResponse {
  shareUrl: string;
  qrData: string;
}

// カード詳細表示用（共有URL用）
export interface PublicCard {
  id: string;
  card_name: string;
  image_url?: string;
  links?: Array<{
    title: string;
    url: string;
  }>;
  owner_name: string;
}

export interface JWTPayload {
  userId: string;
  email: string;
  exp: number;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}
