param(
    [string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
)

$ErrorActionPreference = 'Stop'

$desktopDir = Join-Path $ProjectRoot 'platforms\desktop-electron'
$outputPath = Join-Path $desktopDir 'desktop-oauth-secrets.js'
$localConfigPath = Join-Path $desktopDir 'desktop-oauth.local.json'
$placeholder = 'PASTE_TIMEWHERE_DESKTOP_CLIENT_SECRET_HERE'

function Get-ExistingSecret {
    if (-not (Test-Path -LiteralPath $outputPath)) {
        return ''
    }

    $text = Get-Content -Raw -LiteralPath $outputPath
    $match = [regex]::Match($text, "DEFAULT_DESKTOP_OAUTH_CLIENT_SECRET:\s*(['""])(?<secret>.+?)\1")
    if (-not $match.Success) {
        return ''
    }

    return $match.Groups['secret'].Value
}

function Get-LocalConfigSecret {
    if (-not (Test-Path -LiteralPath $localConfigPath)) {
        return ''
    }

    $json = Get-Content -Raw -LiteralPath $localConfigPath | ConvertFrom-Json
    if ($json.client_secret) {
        return [string]$json.client_secret
    }
    if ($json.installed -and $json.installed.client_secret) {
        return [string]$json.installed.client_secret
    }
    return ''
}

$secret = [string]$env:TIMEWHERE_GOOGLE_DESKTOP_CLIENT_SECRET

if ([string]::IsNullOrWhiteSpace($secret)) {
    $secret = Get-ExistingSecret
}

if ([string]::IsNullOrWhiteSpace($secret) -or $secret -eq $placeholder) {
    $secret = Get-LocalConfigSecret
}

if ([string]::IsNullOrWhiteSpace($secret) -or $secret -eq $placeholder) {
    throw 'Desktop OAuth client secret is required for internal desktop packaging. Set TIMEWHERE_GOOGLE_DESKTOP_CLIENT_SECRET or create platforms/desktop-electron/desktop-oauth.local.json.'
}

$secretLiteral = $secret | ConvertTo-Json -Compress
$content = "module.exports = {`n  DEFAULT_DESKTOP_OAUTH_CLIENT_SECRET: $secretLiteral`n};`n"
Set-Content -LiteralPath $outputPath -Value $content -NoNewline -Encoding UTF8
Write-Output 'Desktop OAuth secret module prepared.'
