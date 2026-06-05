param(
    [string]$Version = "0.3.0",
    [string]$ExpectedExtensionId = "ogdjmelmfkfahppahhkkggdejjainbnd",
    [string]$ExpectedOAuthClientId = "541406150907-rj6d6npl4dnoqcfiaol68tqh8chbpdpg.apps.googleusercontent.com"
)

$ErrorActionPreference = "Stop"

function Get-ExtensionIdFromManifestKey {
    param([string]$ManifestKey)

    $bytes = [Convert]::FromBase64String($ManifestKey)
    $sha256 = [System.Security.Cryptography.SHA256]::Create()
    try {
        $hash = $sha256.ComputeHash($bytes)
    } finally {
        $sha256.Dispose()
    }

    $chars = New-Object System.Collections.Generic.List[string]
    for ($i = 0; $i -lt 16; $i++) {
        $hex = $hash[$i].ToString("x2")
        foreach ($char in $hex.ToCharArray()) {
            $value = [Convert]::ToInt32([string]$char, 16)
            $chars.Add([char]([int][char]'a' + $value))
        }
    }
    return -join $chars
}

function Get-Sha256Hex {
    param([string]$Path)

    $sha256 = [System.Security.Cryptography.SHA256]::Create()
    $stream = [System.IO.File]::OpenRead($Path)
    try {
        $hashBytes = $sha256.ComputeHash($stream)
        return -join ($hashBytes | ForEach-Object { $_.ToString("X2") })
    } finally {
        $stream.Dispose()
        $sha256.Dispose()
    }
}

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
$stage = Join-Path $tmpRoot "local-unpacked-$Version-$stamp"
$stageExtension = Join-Path $stage "extension"
$zipPath = Join-Path $distRoot "TimeWhere-$Version-local-unpacked-$stamp.zip"

if (Test-Path -LiteralPath $stage) {
    $tmpResolved = (Resolve-Path -LiteralPath $tmpRoot).Path
    $stageResolved = (Resolve-Path -LiteralPath $stage).Path
    if (-not $stageResolved.StartsWith($tmpResolved)) {
        throw "Refusing to remove outside .tmp: $stageResolved"
    }
    Remove-Item -LiteralPath $stageResolved -Recurse -Force
}

New-Item -ItemType Directory -Force -Path $stage | Out-Null
Copy-Item -Path $extensionRoot -Destination $stageExtension -Recurse

$manifestPath = Join-Path $stageExtension "manifest.json"
$manifest = Get-Content -Raw -Path $manifestPath | ConvertFrom-Json
if ($manifest.version -ne $Version) {
    throw "Manifest version mismatch. Expected $Version, got $($manifest.version)"
}
if (-not ($manifest.PSObject.Properties.Name -contains "key")) {
    throw "Local unpacked bundle requires manifest.key for fixed extension ID"
}
if ($manifest.oauth2.client_id -ne $ExpectedOAuthClientId) {
    throw "Local unpacked bundle requires development OAuth client ID"
}

$actualExtensionId = Get-ExtensionIdFromManifestKey $manifest.key
if ($actualExtensionId -ne $ExpectedExtensionId) {
    throw "manifest.key derives $actualExtensionId, expected $ExpectedExtensionId"
}

if (Test-Path -LiteralPath $zipPath) {
    Remove-Item -LiteralPath $zipPath -Force
}

Compress-Archive -Path $stageExtension -DestinationPath $zipPath
$hash = Get-Sha256Hex $zipPath

$result = [pscustomobject]@{
    version = $Version
    zip = $zipPath
    sha256 = $hash
    expected_extension_id = $ExpectedExtensionId
    oauth_client_id = $ExpectedOAuthClientId
    install_folder_in_zip = "extension"
    source = $extensionRoot
    stage = $stage
}

$result | ConvertTo-Json -Compress
