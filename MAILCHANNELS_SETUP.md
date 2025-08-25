# Flocka.net ドメインでのMailChannels Email API設定

## MailChannels Email API（有料プラン）の設定

### 1. アカウント登録とAPIキー取得
1. https://mailchannels.com/ でアカウントを作成
2. 無料プランまたは有料プランを選択
3. API キーを取得

### 2. Cloudflare Workers環境変数設定
`wrangler.toml`にAPIキーを追加：
```toml
[vars]
MAILCHANNELS_API_KEY = "your-mailchannels-api-key-here"
```

### 3. DNS設定（任意 - ドメイン認証用）

#### SPFレコード
ドメイン: flocka.net
タイプ: TXT
値: `v=spf1 a mx include:relay.mailchannels.net ~all`

#### DKIMレコード
ドメイン: mailchannels._domainkey.flocka.net
タイプ: TXT
値: MailChannelsから提供される公開鍵（設定後に取得）

#### DMARCレコード（推奨）
ドメイン: _dmarc.flocka.net
タイプ: TXT
値: `v=DMARC1; p=none; rua=mailto:dmarc@flocka.net`

## MailChannels設定手順

1. Cloudflare Workers内でMailChannelsのドメイン認証APIを呼び出し
2. flocka.netドメインを登録
3. 提供されるDKIM公開鍵をDNSに設定
4. 認証完了後、noreply@flocka.netからのメール送信が可能

## 現在の設定状況

- 送信者メールアドレス: noreply@flocka.net
- 認証URL: https://flocka.net/auth/verify?token={token}
- MailChannelsのドメイン認証: **要設定**

## 注意事項

ドメイン認証が完了していない場合、MailChannelsからのメール送信は失敗する可能性があります。
テスト段階では一時的に他の認証済みドメインを使用することを推奨します。
