/**
 * バリデーション関連のユーティリティ
 */

/**
 * URLの有効性をチェックする
 */
export function validateURL(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * カードのリンク情報をバリデーションする
 */
export function validateCardLinks(links: any): boolean {
  if (!Array.isArray(links)) {
    return false;
  }
  
  // 最大4つまで
  if (links.length > 4) {
    return false;
  }
  
  // 各リンクの構造をチェック
  for (const link of links) {
    if (!link.title || !link.url || typeof link.title !== 'string' || typeof link.url !== 'string') {
      return false;
    }
    
    // URLの有効性をチェック
    if (!validateURL(link.url)) {
      return false;
    }
    
    // タイトルの長さ制限
    if (link.title.length > 50) {
      return false;
    }
  }
  
  return true;
}

/**
 * カード名のバリデーション
 */
export function validateCardName(name: string): boolean {
  return (
    typeof name === 'string' &&
    name.trim().length > 0 &&
    name.length <= 100
  );
}

/**
 * bioのバリデーション
 */
export function validateBio(bio: string): boolean {
  return (
    typeof bio === 'string' &&
    bio.length <= 200
  );
}

/**
 * ファイル名のバリデーション
 */
export function validateFileName(fileName: string): boolean {
  const allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
  const extension = fileName.toLowerCase().substring(fileName.lastIndexOf('.'));
  
  return (
    fileName.length > 0 &&
    fileName.length <= 255 &&
    allowedExtensions.includes(extension) &&
    !/[<>:"/\\|?*]/.test(fileName) // 危険な文字を含まない
  );
}

/**
 * メモのバリデーション
 */
export function validateMemo(memo: string): boolean {
  return (
    typeof memo === 'string' &&
    memo.length <= 500
  );
}

/**
 * 基本的な座標の有効性チェック（記録用）
 * アプリで位置情報処理は完結するが、記録として保存する場合のバリデーション
 */
export function validateCoordinates(latitude?: number, longitude?: number): boolean {
  if (latitude === undefined || longitude === undefined) return true; // オプション
  return (
    typeof latitude === 'number' &&
    typeof longitude === 'number' &&
    latitude >= -90 && latitude <= 90 &&
    longitude >= -180 && longitude <= 180 &&
    !isNaN(latitude) && !isNaN(longitude)
  );
}

/**
 * エラーメッセージを生成する
 */
export function createValidationError(field: string, message: string): string {
  return `${field}: ${message}`;
}
