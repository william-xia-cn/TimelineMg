param(
    [string]$CodexConfigPath = (Join-Path $env:USERPROFILE '.codex\config.toml'),
    [string]$ProjectRoot = 'D:\Codex\ThmeWhere-Master',
    [string]$NodePath = 'C:\Program Files\nodejs\node.exe'
)

$ErrorActionPreference = 'Stop'

$serverName = 'timewhere_desktop_mcp'
$serverDisplayName = 'timewhere-desktop-mcp'
$scriptRelativePath = 'platforms/desktop-electron/mcp-stdio-server.js'
$serverScriptPath = Join-Path $ProjectRoot $scriptRelativePath

if (-not (Test-Path -LiteralPath $NodePath)) {
    throw "Node executable not found: $NodePath"
}

if (-not (Test-Path -LiteralPath $serverScriptPath)) {
    throw "TimeWhere MCP stdio server not found: $serverScriptPath"
}

$configDir = Split-Path -Parent $CodexConfigPath
if (-not (Test-Path -LiteralPath $configDir)) {
    New-Item -ItemType Directory -Force -Path $configDir | Out-Null
}

$content = ''
if (Test-Path -LiteralPath $CodexConfigPath) {
    $content = Get-Content -Raw -LiteralPath $CodexConfigPath
}

$block = @"
[mcp_servers.timewhere_desktop_mcp]
command = '$NodePath'
args = ['$scriptRelativePath']
cwd = '$ProjectRoot'
startup_timeout_sec = 30.0
tool_timeout_sec = 60.0
default_tools_approval_mode = "writes"
"@

$pattern = '(?ms)^\[mcp_servers\.timewhere[-_]desktop[-_]mcp\]\r?\n.*?(?=^\[|\z)'
$hadExisting = [regex]::IsMatch($content, $pattern)
$content = [regex]::Replace($content, $pattern, '')
$content = $content.TrimEnd() + "`r`n`r`n" + $block.TrimEnd() + "`r`n"

Set-Content -LiteralPath $CodexConfigPath -Value $content -NoNewline -Encoding UTF8

if ($hadExisting) {
    Write-Output "Updated MCP server registration: $serverDisplayName ($serverName)"
} else {
    Write-Output "Added MCP server registration: $serverDisplayName ($serverName)"
}
Write-Output "Config: $CodexConfigPath"
Write-Output "Command: $NodePath"
Write-Output "Cwd: $ProjectRoot"
Write-Output "Args: $scriptRelativePath"