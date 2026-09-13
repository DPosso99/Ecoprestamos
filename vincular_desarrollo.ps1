# ==============================================================================
# Script de Vinculacion de Desarrollo - EcoPrestamos MediaLab (WordPress Local)
# Universidad EAFIT
# ==============================================================================
# Este script crea uniones NTFS (Junctions) entre tu carpeta de desarrollo
# y el sitio en LocalWP, permitiendo que cualquier cambio en el codigo se
# refleje inmediatamente en el navegador sin tener que copiar archivos.
# ==============================================================================

Clear-Host

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "   EcoPrestamos - Vinculacion de Desarrollo LocalWP       " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host ""

$repoRoot = $PSScriptRoot
if (-not $repoRoot) {
    $repoRoot = (Get-Location).Path
}

$pluginSource = Join-Path $repoRoot "ecoprestamos-plugin"
$themeSource  = Join-Path $repoRoot "ecoprestamos-theme"

if (-not (Test-Path $pluginSource) -or -not (Test-Path $themeSource)) {
    Write-Host "[ERROR] No se encontraron las carpetas 'ecoprestamos-plugin' o 'ecoprestamos-theme'." -ForegroundColor Red
    Write-Host "Asegurate de ejecutar este script desde la raiz de Ecoprestamos-WP." -ForegroundColor Yellow
    exit 1
}

# 1. Detectar ubicacion del sitio en LocalWP
$defaultLocalSite = Join-Path $env:USERPROFILE "Local Sites\ecoprestamos"
$localSitePath = $defaultLocalSite

if (-not (Test-Path $localSitePath)) {
    Write-Host "[AVISO] No se encontro el sitio en la ruta por defecto:" -ForegroundColor Yellow
    Write-Host "  $defaultLocalSite" -ForegroundColor Gray
    Write-Host ""
    $inputPath = Read-Host "Ingresa la ruta a tu sitio en LocalWP (ej. C:\Users\$env:USERNAME\Local Sites\ecoprestamos)"
    if ($inputPath -and (Test-Path $inputPath)) {
        $localSitePath = $inputPath.Trim('"')
    } else {
        Write-Host "[ERROR] Ruta no valida. Crea primero el sitio en LocalWP antes de vincular." -ForegroundColor Red
        exit 1
    }
}

$pluginsDir = Join-Path $localSitePath "app\public\wp-content\plugins"
$themesDir  = Join-Path $localSitePath "app\public\wp-content\themes"

if (-not (Test-Path $pluginsDir) -or -not (Test-Path $themesDir)) {
    Write-Host "[ERROR] No se encontraron las carpetas 'wp-content/plugins' o 'wp-content/themes' en:" -ForegroundColor Red
    Write-Host "  $localSitePath" -ForegroundColor Gray
    exit 1
}

$pluginTarget = Join-Path $pluginsDir "ecoprestamos-plugin"
$themeTarget  = Join-Path $themesDir  "ecoprestamos-theme"

Write-Host "Configuracion detectada:" -ForegroundColor Green
Write-Host "  Repositorio : $repoRoot" -ForegroundColor Gray
Write-Host "  Sitio Local : $localSitePath" -ForegroundColor Gray
Write-Host ""

# 2. Vincular Plugin
Write-Host "1. Vinculando Plugin 'ecoprestamos-plugin'..." -NoNewline
if (Test-Path $pluginTarget) {
    cmd /c rmdir /s /q "$pluginTarget" 2>$null
    if (Test-Path $pluginTarget) {
        Remove-Item -Path $pluginTarget -Recurse -Force -ErrorAction SilentlyContinue
    }
}
New-Item -ItemType Junction -Path $pluginTarget -Target $pluginSource | Out-Null
Write-Host " [OK] Conectado" -ForegroundColor Green

# 3. Vincular Tema
Write-Host "2. Vinculando Tema 'ecoprestamos-theme'..." -NoNewline
if (Test-Path $themeTarget) {
    cmd /c rmdir /s /q "$themeTarget" 2>$null
    if (Test-Path $themeTarget) {
        Remove-Item -Path $themeTarget -Recurse -Force -ErrorAction SilentlyContinue
    }
}
New-Item -ItemType Junction -Path $themeTarget -Target $themeSource | Out-Null
Write-Host " [OK] Conectado" -ForegroundColor Green

Write-Host ""
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  VINCULACION EXITOSA!                                    " -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "Cualquier cambio que realices en tu codigo se reflejara"
Write-Host "inmediatamente en http://ecoprestamos.local/"
Write-Host ""
if ([Environment]::UserInteractive) {
    Write-Host "Presiona Enter para finalizar..."
    $null = Read-Host
}
