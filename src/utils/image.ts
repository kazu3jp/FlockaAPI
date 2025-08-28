/**
 * 画像処理関連のユーティリティ
 */

/**
 * サポートされている画像タイプ
 */
export const SUPPORTED_IMAGE_TYPES = [
  'image/jpeg',
  'image/jpg', 
  'image/png',
  'image/gif',
  'image/webp'
] as const;

/**
 * 最大ファイルサイズ（10MB）
 */
export const MAX_FILE_SIZE = 10 * 1024 * 1024;

/**
 * Content-Typeの有効性をチェックする
 */
export function validateImageContentType(contentType: string): boolean {
  return SUPPORTED_IMAGE_TYPES.includes(contentType as any);
}

/**
 * ファイルサイズの有効性をチェックする
 */
export function validateFileSize(size: number): boolean {
  return size > 0 && size <= MAX_FILE_SIZE;
}

/**
 * 画像用のR2キーを生成する
 */
export function generateImageKey(userId: string, fileName: string): string {
  const timestamp = Date.now();
  const randomId = crypto.randomUUID().substring(0, 8);
  const extension = fileName.substring(fileName.lastIndexOf('.'));
  
  return `cards/${userId}/${timestamp}-${randomId}${extension}`;
}

/**
 * R2の画像URLを生成する
 */
export function generateImageURL(imageKey: string, r2Domain: string): string {
  return `https://${r2Domain}/${imageKey}`;
}

/**
 * 画像のメタデータを抽出する
 */
export interface ImageMetadata {
  contentType: string;
  size: number;
  fileName: string;
  key: string;
}

/**
 * アップロード用の画像メタデータを作成する
 */
export function createImageMetadata(
  fileName: string,
  contentType: string,
  size: number,
  userId: string
): ImageMetadata {
  return {
    contentType,
    size,
    fileName,
    key: generateImageKey(userId, fileName),
  };
}
