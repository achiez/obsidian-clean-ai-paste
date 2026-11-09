$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$output = Join-Path $repo 'dist'
$bundle = Join-Path $output 'Clean-AI-Paste-Local'
$plugin = Join-Path $bundle 'clean-ai-paste-local'
New-Item -ItemType Directory -Path $plugin -Force | Out-Null
foreach ($name in @('main.js', 'manifest.json')) {
    Copy-Item -LiteralPath (Join-Path $repo $name) -Destination (Join-Path $plugin $name) -Force
}
foreach ($name in @('Install.cmd', 'Install.ps1', 'LICENSE', 'INSTALL.md')) {
    Copy-Item -LiteralPath (Join-Path $repo $name) -Destination (Join-Path $bundle $name) -Force
}
$zip = Join-Path $output 'Clean-AI-Paste-Local-1.5.1.zip'
Compress-Archive -LiteralPath $bundle -DestinationPath $zip -Force
Get-FileHash -LiteralPath $zip -Algorithm SHA256
