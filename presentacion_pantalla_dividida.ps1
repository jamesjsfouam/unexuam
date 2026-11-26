# ==============================================================================
# UNEXUAM - Lanzador de Presentación en Pantalla Dividida (Web + Celular)
# ==============================================================================
# Mitad Izquierda: Aplicación Web UNEXUAM (Administrador / Central de Mando)
# Mitad Derecha:   Celular en vivo transmitido con scrcpy (Estudiante / Modo Invitado)
# ==============================================================================

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "   UNEXUAM - PREPARANDO PRESENTACION EN PANTALLA DIVIDIDA " -ForegroundColor Yellow
Write-Host "==========================================================" -ForegroundColor Cyan

$Raiz = $PSScriptRoot
Set-Location $Raiz

# 1. Verificar si el servidor local Flask está activo
$ServidorListo = $false
try {
    $res = Invoke-RestMethod -Uri "http://127.0.0.1:5000/api/campus/publico" -TimeoutSec 2 -ErrorAction Stop
    if ($res.ok) { $ServidorListo = $true }
} catch {
    $ServidorListo = $false
}

if (-not $ServidorListo) {
    Write-Host "[1/4] Iniciando servidor Flask local en http://127.0.0.1:5000..." -ForegroundColor Green
    Start-Process -FilePath "python" -ArgumentList "app.py" -WorkingDirectory $Raiz -WindowStyle Hidden
    Start-Sleep -Seconds 2
} else {
    Write-Host "[1/4] Servidor Flask local ya esta activo." -ForegroundColor Green
}

# 2. Configurar ADB y Celular
$Adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
if (-not (Test-Path $Adb)) {
    $AdbCmd = Get-Command adb -ErrorAction SilentlyContinue
    if ($AdbCmd) { $Adb = $AdbCmd.Source }
}

$Scrcpy = "C:\Users\USER\AppData\Local\Microsoft\WinGet\Packages\Genymobile.scrcpy_Microsoft.Winget.Source_8wekyb3d8bbwe\scrcpy-win64-v5.0.1\scrcpy.exe"
if (-not (Test-Path $Scrcpy)) {
    $ScrcpyCmd = Get-Command scrcpy -ErrorAction SilentlyContinue
    if ($ScrcpyCmd) { $Scrcpy = $ScrcpyCmd.Source }
}

Write-Host "[2/4] Verificando conexion con celular Samsung por ADB..." -ForegroundColor Green
$Disp = & $Adb devices | Where-Object { $_ -match "\bdevice\b" }

if ($Disp) {
    Write-Host "  -> Celular detectado. Configurando tunel reverso (tcp:5000)..." -ForegroundColor Cyan
    & $Adb reverse tcp:5000 tcp:5000
    Write-Host "  -> Verificando instalacion de Unexuam.apk..." -ForegroundColor Cyan
    $ApkPath = Join-Path $Raiz "mobile\Unexuam.apk"
    if (Test-Path $ApkPath) {
        & $Adb install -r $ApkPath
    }
    Write-Host "  -> Abriendo UNEXUAM en el celular..." -ForegroundColor Cyan
    & $Adb shell am start -n ni.edu.uam.unexuam/.MainActivity
} else {
    Write-Host "  [AVISO] No se detecto celular conectado por USB todavia." -ForegroundColor Yellow
    Write-Host "  Conecta el cable USB y activa Depuracion USB en tu Galaxy A33." -ForegroundColor Yellow
}

# 3. Calcular dimensiones de pantalla dividida 50% / 50%
Add-Type -AssemblyName System.Windows.Forms
$AreaTrabajo = [System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea
$AnchoMitad = [math]::Floor($AreaTrabajo.Width / 2)
$AltoPantalla = $AreaTrabajo.Height

Write-Host "[3/4] Resolucion detectada: $($AreaTrabajo.Width)x$($AltoPantalla). Mitad: $($AnchoMitad)px" -ForegroundColor Green

# 4. Lanzar Navegador (Izquierda)
$Navegador = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
if (-not (Test-Path $Navegador)) {
    $Navegador = "C:\Program Files\Google\Chrome\Application\chrome.exe"
}

Write-Host "[4/4] Lanzando Web (Izquierda) y Espejo Celular (Derecha)..." -ForegroundColor Green
$ArgsWeb = @(
    "--app=http://127.0.0.1:5000",
    "--window-position=0,0",
    "--window-size=$AnchoMitad,$AltoPantalla"
)
Start-Process -FilePath $Navegador -ArgumentList $ArgsWeb

# Lanzar scrcpy (Derecha)
if (Test-Path $Scrcpy) {
    $ArgsScrcpy = @(
        "--window-title=UNEXUAM - Celular (Samsung Galaxy A33)",
        "--window-x=$AnchoMitad",
        "--window-y=0",
        "--window-width=$AnchoMitad",
        "--window-height=$AltoPantalla",
        "--stay-awake"
    )
    Start-Process -FilePath $Scrcpy -ArgumentList $ArgsScrcpy
} else {
    Write-Host "scrcpy no encontrado. Ejecuta 'winget install Genymobile.scrcpy'" -ForegroundColor Red
}

Write-Host "`nListo! Tienes la Web a la izquierda y el celular a la derecha para tu presentacion." -ForegroundColor Cyan
