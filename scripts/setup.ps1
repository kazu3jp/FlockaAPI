# Flocka API セットアップスクリプト
# PowerShell用

Write-Host "🚀 Flocka API のセットアップを開始します..." -ForegroundColor Green

# 1. 依存関係のインストール
Write-Host "📦 依存関係をインストール中..." -ForegroundColor Yellow
npm install

# 2. D1データベースの作成
Write-Host "🗄️ D1データベースを作成中..." -ForegroundColor Yellow
$dbResult = npx wrangler d1 create flocka-db | Out-String

if ($dbResult -match 'database_id = "([^"]+)"') {
    $databaseId = $matches[1]
    Write-Host "✅ データベースが作成されました。ID: $databaseId" -ForegroundColor Green
    Write-Host "⚠️ wrangler.toml の database_id を以下の値に変更してください:" -ForegroundColor Red
    Write-Host $databaseId -ForegroundColor Cyan
} else {
    Write-Host "❌ データベースの作成に失敗しました" -ForegroundColor Red
}

# 3. R2バケットの作成
Write-Host "📁 R2バケットを作成中..." -ForegroundColor Yellow
npx wrangler r2 bucket create flocka-storage

# 4. セットアップ完了メッセージ
Write-Host ""
Write-Host "🎉 セットアップが完了しました！" -ForegroundColor Green
Write-Host ""
Write-Host "次の手順を実行してください:" -ForegroundColor Yellow
Write-Host "1. wrangler.toml の database_id を上記の値に変更"
Write-Host "2. wrangler.toml の JWT_SECRET を安全な値に変更"
Write-Host "3. npm run db:generate でデータベーススキーマを適用"
Write-Host "4. npm run dev で開発サーバーを起動"
Write-Host ""
Write-Host "詳細は README.md をご確認ください。" -ForegroundColor Cyan
