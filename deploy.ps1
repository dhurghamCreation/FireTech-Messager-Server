# FireTech Messenger Auto-Deployment Script
# This script commits and pushes code to GitHub, triggering Railway auto-deploy
# Usage: .\deploy.ps1 "your commit message"

param(
    [string]$Message = "Auto-deploy update"
)

Write-Host "🚀 FireTech Messenger Deployment Handler" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Verify git is available
$gitExists = git --version 2>$null
if (-not $gitExists) {
    Write-Host "❌ Git not found. Please install Git for Windows." -ForegroundColor Red
    exit 1
}

# Check git status
$status = git status --porcelain
if ([string]::IsNullOrWhiteSpace($status)) {
    Write-Host "✅ No changes to commit. Repository is clean." -ForegroundColor Green
    exit 0
}

Write-Host "📝 Staging changes..." -ForegroundColor Yellow
git add -A

Write-Host "💾 Committing with message: '$Message'" -ForegroundColor Yellow
git commit -m "$Message"

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Commit failed." -ForegroundColor Red
    exit 1
}

Write-Host "📤 Pushing to GitHub (triggers Railway auto-deploy)..." -ForegroundColor Yellow
git push origin main

if ($LASTEXITCODE -eq 0) {
    Write-Host "" -ForegroundColor Green
    Write-Host "✅ Push successful!" -ForegroundColor Green
    Write-Host "🎉 Railway is now auto-deploying from GitHub..." -ForegroundColor Green
    Write-Host "   Check dashboard: https://railway.app/" -ForegroundColor Cyan
    Write-Host "" -ForegroundColor Green
} else {
    Write-Host "❌ Push failed. Check your GitHub credentials." -ForegroundColor Red
    exit 1
}
