-- Flocka データベーススキーマ
-- 場所情報を含む完全なデータベース設計

-- ユーザーテーブル
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    hashed_password TEXT NOT NULL,
    email_verified INTEGER DEFAULT 0 CHECK (email_verified IN (0, 1)),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- プロフィールカードテーブル
CREATE TABLE IF NOT EXISTS cards (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    user_id TEXT NOT NULL,
    card_name TEXT NOT NULL,
    image_key TEXT, -- R2のオブジェクトキー
    links TEXT, -- JSON形式のリンク情報
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- カード交換・コレクションテーブル（場所情報付き）
CREATE TABLE IF NOT EXISTS exchanges (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    owner_user_id TEXT NOT NULL, -- カードをコレクションしたユーザー
    collected_card_id TEXT NOT NULL, -- コレクションされたカード
    memo TEXT, -- 個人的なメモ
    location_name TEXT, -- 交換した場所の名前（例: 「東京ビッグサイト」）
    latitude REAL, -- 交換した場所の緯度
    longitude REAL, -- 交換した場所の経度
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (collected_card_id) REFERENCES cards(id) ON DELETE CASCADE,
    UNIQUE(owner_user_id, collected_card_id) -- 同じカードを重複コレクションしないため
);

-- 交換リクエストテーブル（近距離交換用）
CREATE TABLE IF NOT EXISTS exchange_requests (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    from_user_id TEXT NOT NULL, -- リクエスト送信者
    to_user_id TEXT NOT NULL, -- リクエスト受信者
    card_id TEXT NOT NULL, -- 交換対象のカード
    message TEXT, -- リクエストメッセージ
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'expired')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME DEFAULT (datetime('now', '+30 minutes')), -- 30分で自動期限切れ
    FOREIGN KEY (from_user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (to_user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE CASCADE
);

-- QR交換用一時トークンテーブル
CREATE TABLE IF NOT EXISTS qr_exchange_tokens (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    card_id TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME DEFAULT (datetime('now', '+30 minutes')), -- 30分で自動期限切れ
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE CASCADE
);

-- インデックスの作成
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_cards_user_id ON cards(user_id);
CREATE INDEX IF NOT EXISTS idx_exchanges_owner ON exchanges(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_exchanges_card ON exchanges(collected_card_id);
CREATE INDEX IF NOT EXISTS idx_exchanges_location ON exchanges(latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_exchange_requests_to_user ON exchange_requests(to_user_id);
CREATE INDEX IF NOT EXISTS idx_exchange_requests_from_user ON exchange_requests(from_user_id);
CREATE INDEX IF NOT EXISTS idx_exchange_requests_status ON exchange_requests(status);
CREATE INDEX IF NOT EXISTS idx_qr_tokens_expires ON qr_exchange_tokens(expires_at);
