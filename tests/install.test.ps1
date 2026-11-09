$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$fixture = Join-Path ([System.IO.Path]::GetTempPath()) ('clean-ai-paste-install-test-' + [guid]::NewGuid().ToString('N'))
$vault = Join-Path $fixture 'Vault with spaces'
$plugins = Join-Path $vault '.obsidian\plugins'
$original = Join-Path $plugins 'clean-ai-paste'
$other = Join-Path $plugins 'other-plugin'
New-Item -ItemType Directory -Path $original, $other -Force | Out-Null
$enabled = Join-Path $vault '.obsidian\community-plugins.json'
$enabledContent = '["other-plugin", "clean-ai-paste"]'
[IO.File]::WriteAllText($enabled, $enabledContent)
[IO.File]::WriteAllText((Join-Path $original 'main.js'), 'original plugin must remain untouched')
[IO.File]::WriteAllText((Join-Path $original 'data.json'), '{"debugMode":true}')
[IO.File]::WriteAllText((Join-Path $other 'data.json'), 'other settings must remain untouched')

$zip = Join-Path $repo 'dist\Clean-AI-Paste-Local-1.5.1.zip'
$unpacked = Join-Path $fixture 'Unpacked bundle'
Expand-Archive -LiteralPath $zip -DestinationPath $unpacked
$installer = Join-Path $unpacked 'Clean-AI-Paste-Local\Install.ps1'
& $installer -VaultPath $vault
if ($LASTEXITCODE -and $LASTEXITCODE -ne 0) { throw 'First installation failed' }
$local = Join-Path $plugins 'clean-ai-paste-local'
foreach ($name in @('main.js', 'manifest.json')) {
    $expectedHash = (Get-FileHash -LiteralPath (Join-Path $repo $name)).Hash
    if ((Get-FileHash -LiteralPath (Join-Path $local $name)).Hash -ne $expectedHash) { throw "Wrong installed bytes: $name" }
}
if ([IO.File]::ReadAllText((Join-Path $local 'data.json')) -ne '{"debugMode":true}') { throw 'Original preferences were not imported' }

[IO.File]::WriteAllText((Join-Path $local 'data.json'), '{"debugMode":false,"keep":"local"}')
[IO.File]::WriteAllText((Join-Path $local 'main.js'), 'previous local code')
& $installer -VaultPath $vault
if ([IO.File]::ReadAllText((Join-Path $local 'data.json')) -ne '{"debugMode":false,"keep":"local"}') { throw 'Local preferences overwritten' }
$backupFound = Get-ChildItem -LiteralPath (Join-Path $local 'backups') -Filter main.js -Recurse |
    Where-Object { [IO.File]::ReadAllText($_.FullName) -eq 'previous local code' }
if (-not $backupFound) { throw 'Previous local code was not backed up' }
if ([IO.File]::ReadAllText($enabled) -ne $enabledContent) { throw 'Enabled-plugin list changed' }
if ([IO.File]::ReadAllText((Join-Path $original 'main.js')) -ne 'original plugin must remain untouched') { throw 'Original plugin changed' }
if ([IO.File]::ReadAllText((Join-Path $other 'data.json')) -ne 'other settings must remain untouched') { throw 'Other plugin changed' }

$invalidVault = Join-Path $fixture 'Not a vault'
New-Item -ItemType Directory -Path $invalidVault | Out-Null
$failureOutput = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $installer -VaultPath $invalidVault 2>&1
if ($LASTEXITCODE -ne 1) { throw 'Invalid vault was not rejected' }
if (Test-Path -LiteralPath (Join-Path $invalidVault '.obsidian')) { throw 'Invalid vault was mutated' }
Write-Output 'PASS: extracted ZIP installs exact bytes, imports/preserves preferences, backs up replaced code, preserves other plugins and enabled list, and rejects invalid vaults.'
exit 0
