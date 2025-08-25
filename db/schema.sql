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

-- インデックスの作成
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_cards_user_id ON cards(user_id);
CREATE INDEX IF NOT EXISTS idx_exchanges_owner ON exchanges(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_exchanges_card ON exchanges(collected_card_id);
CREATE INDEX IF NOT EXISTS idx_exchanges_location ON exchanges(latitude, longitude);
