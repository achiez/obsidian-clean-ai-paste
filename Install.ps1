param([string]$VaultPath)

$ErrorActionPreference = 'Stop'

try {
    if (-not $VaultPath) {
        Add-Type -AssemblyName System.Windows.Forms
        $picker = New-Object System.Windows.Forms.FolderBrowserDialog
        $picker.Description = 'Choose your Obsidian vault folder (the folder containing .obsidian)'
        if ($picker.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) { exit 0 }
        $VaultPath = $picker.SelectedPath
    }

    $vault = (Resolve-Path -LiteralPath $VaultPath).Path
    $config = Join-Path $vault '.obsidian'
    if (-not (Test-Path -LiteralPath $config -PathType Container)) {
        throw 'This folder does not contain .obsidian. Choose the vault folder, not its parent.'
    }

    $pluginId = 'clean-ai-paste-local'
    $source = Join-Path $PSScriptRoot $pluginId
    if (-not (Test-Path -LiteralPath (Join-Path $source 'manifest.json'))) { $source = $PSScriptRoot }
    $manifest = Get-Content -LiteralPath (Join-Path $source 'manifest.json') -Raw | ConvertFrom-Json
    if ($manifest.id -ne $pluginId) { throw 'Unexpected plugin manifest; installation stopped.' }
    foreach ($name in @('main.js', 'manifest.json')) {
        if (-not (Test-Path -LiteralPath (Join-Path $source $name) -PathType Leaf)) {
            throw "Missing plugin file: $name. Extract the entire ZIP before installing."
        }
    }

    $target = Join-Path (Join-Path $config 'plugins') $pluginId
    New-Item -ItemType Directory -Path $target -Force | Out-Null
    $backup = Join-Path (Join-Path $target 'backups') (Get-Date -Format 'yyyyMMdd-HHmmss-ffff')
    foreach ($name in @('main.js', 'manifest.json')) {
        $destination = Join-Path $target $name
        if (Test-Path -LiteralPath $destination) {
            New-Item -ItemType Directory -Path $backup -Force | Out-Null
            Copy-Item -LiteralPath $destination -Destination (Join-Path $backup $name)
        }
        Copy-Item -LiteralPath (Join-Path $source $name) -Destination $destination -Force
    }

    # Existing local preferences take precedence. Import original preferences only once.
    $settings = Join-Path $target 'data.json'
    $originalSettings = Join-Path (Join-Path (Join-Path $config 'plugins') 'clean-ai-paste') 'data.json'
    if (-not (Test-Path -LiteralPath $settings) -and (Test-Path -LiteralPath $originalSettings)) {
        Copy-Item -LiteralPath $originalSettings -Destination $settings
    }

    Write-Host ''
    Write-Host "Installed Clean AI Paste Local $($manifest.version) into $vault" -ForegroundColor Green
    Write-Host 'In Obsidian: Settings > Community plugins > enable Clean AI Paste Local.'
    Write-Host 'If it is missing, restart Obsidian. Disable the original Clean AI Paste if installed.'
    Write-Host 'Your plugin settings and other plugins were preserved.'
} catch {
    Write-Host "Installation failed: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
