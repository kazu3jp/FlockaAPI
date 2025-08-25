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
  name: string;
  hashed_password: string;
  email_verified: number;
  created_at: string;
}

export interface Card {
  id: string;
  user_id: string;
  card_name: string;
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

// APIリクエスト/レスポンスの型定義
export interface RegisterRequest {
  email: string;
  name: string;
  password: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface VerifyEmailRequest {
  token: string;
}

export interface CreateCardRequest {
  card_name: string;
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
