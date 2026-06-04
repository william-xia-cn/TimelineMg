param(
    [string]$Version = "0.2.3",
    [string]$CwsOAuthClientId = "541406150907-u6pvenpfdpgfmgnv8h9f126l4hc4oru9.apps.googleusercontent.com"
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$extensionRoot = Join-Path $repoRoot "extension"
$distRoot = Join-Path $repoRoot "dist"
$tmpRoot = Join-Path $repoRoot ".tmp"

if (-not (Test-Path -LiteralPath $extensionRoot)) {
    throw "Missing extension directory: $extensionRoot"
}

New-Item -ItemType Directory -Force -Path $distRoot | Out-Null
New-Item -ItemType Directory -Force -Path $tmpRoot | Out-Null

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$stage = Join-Path $tmpRoot "cws-package-$Version-$stamp"
$zipPath = Join-Path $distRoot "TimeWhere-$Version-private-cws-sanitized-$stamp.zip"

if (Test-Path -LiteralPath $stage) {
    $tmpResolved = (Resolve-Path -LiteralPath $tmpRoot).Path
    $stageResolved = (Resolve-Path -LiteralPath $stage).Path
    if (-not $stageResolved.StartsWith($tmpResolved)) {
        throw "Refusing to remove outside .tmp: $stageResolved"
    }
    Remove-Item -LiteralPath $stageResolved -Recurse -Force
}

Copy-Item -Path $extensionRoot -Destination $stage -Recurse

$manifestPath = Join-Path $stage "manifest.json"
$manifest = Get-Content -Raw -Path $manifestPath | ConvertFrom-Json
$manifest.version = $Version
$manifest.oauth2.client_id = $CwsOAuthClientId
if ($manifest.PSObject.Properties.Name -contains "key") {
    $manifest.PSObject.Properties.Remove("key")
}
$manifest | ConvertTo-Json -Depth 20 | Set-Content -Path $manifestPath -Encoding UTF8

if (Test-Path -LiteralPath $zipPath) {
    Remove-Item -LiteralPath $zipPath -Force
}

Compress-Archive -Path (Join-Path $stage "*") -DestinationPath $zipPath
$sha256 = [System.Security.Cryptography.SHA256]::Create()
$stream = [System.IO.File]::OpenRead($zipPath)
try {
    $hashBytes = $sha256.ComputeHash($stream)
    $hash = -join ($hashBytes | ForEach-Object { $_.ToString("X2") })
} finally {
    $stream.Dispose()
    $sha256.Dispose()
}

$result = [pscustomobject]@{
    version = $Version
    zip = $zipPath
    sha256 = $hash
    cws_oauth_client_id = $CwsOAuthClientId
    source = $extensionRoot
    stage = $stage
}

$result | ConvertTo-Json -Compress
