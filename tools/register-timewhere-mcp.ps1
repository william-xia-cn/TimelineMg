param(
    [string]$CodexCliPath = '',
    [string]$ProjectRoot = 'D:\Codex\ThmeWhere-Master',
    [string]$NodePath = 'C:\Program Files\nodejs\node.exe',
    [string]$ServerName = 'timewhere_desktop_mcp'
)

$ErrorActionPreference = 'Stop'

$serverDisplayName = 'timewhere-desktop-mcp'
$serverScriptPath = Join-Path $ProjectRoot 'platforms\desktop-electron\mcp-stdio-server.js'
$configPath = Join-Path $env:USERPROFILE '.codex\config.toml'

function Resolve-CodexCliPath {
    param([string]$ExplicitPath)

    if ($ExplicitPath -and (Test-Path -LiteralPath $ExplicitPath)) {
        return $ExplicitPath
    }

    if (Test-Path -LiteralPath $configPath) {
        $configText = Get-Content -Raw -LiteralPath $configPath
        $match = [regex]::Match($configText, "CODEX_CLI_PATH\s*=\s*(['""'])(?<path>.+?)\1")
        if ($match.Success -and (Test-Path -LiteralPath $match.Groups['path'].Value)) {
            return $match.Groups['path'].Value
        }
    }

    $command = Get-Command codex -ErrorAction SilentlyContinue
    if ($command -and (Test-Path -LiteralPath $command.Source)) {
        return $command.Source
    }

    throw 'Codex CLI executable not found. Pass -CodexCliPath explicitly.'
}

if (-not (Test-Path -LiteralPath $NodePath)) {
    throw "Node executable not found: $NodePath"
}

if (-not (Test-Path -LiteralPath $serverScriptPath)) {
    throw "TimeWhere MCP stdio server not found: $serverScriptPath"
}

$resolvedCodexCli = Resolve-CodexCliPath $CodexCliPath

& $resolvedCodexCli mcp remove $ServerName | Out-Null
& $resolvedCodexCli mcp add $ServerName -- $NodePath $serverScriptPath | Out-Null

Write-Output "Registered MCP server: $serverDisplayName ($ServerName)"
Write-Output "Codex CLI: $resolvedCodexCli"
Write-Output "Command: $NodePath"
Write-Output "Args: $serverScriptPath"
Write-Output "Verify: codex mcp list --json"
