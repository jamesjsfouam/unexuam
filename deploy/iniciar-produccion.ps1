# Arranca Unexuam en producción (Windows / PowerShell). Copia .env.example a .env y complétalo antes.
#   1) waitress (servir.py) en 127.0.0.1:8080, un solo proceso
#   2) Caddy delante con HTTPS (deploy/Caddyfile)
# Uso:  powershell -ExecutionPolicy Bypass -File deploy\iniciar-produccion.ps1 -Dominio unexuam.uam.edu.ni
param(
    [Parameter(Mandatory = $true)][string]$Dominio,
    [int]$Puerto = 8080
)
$ErrorActionPreference = "Stop"
$raiz = Split-Path -Parent $PSScriptRoot
Set-Location $raiz

# Variables de .env (líneas CLAVE=valor; se ignoran comentarios y vacías)
if (Test-Path "$raiz\.env") {
    Get-Content "$raiz\.env" | Where-Object { $_ -match '^\s*[A-Z_]+=' } | ForEach-Object {
        $k, $v = $_ -split '=', 2
        if ($v -ne '') { Set-Item -Path "env:$($k.Trim())" -Value $v.Trim() }
    }
}
$env:UNEXUAM_PROXY = "1"          # confía en X-Forwarded-For de Caddy, cookies Secure y HSTS
$env:UNEXUAM_DEMO = "0"           # sin teléfonos simulados
$env:HOST = "127.0.0.1"           # solo Caddy habla con el servidor
$env:PORT = "$Puerto"
$env:UNEXUAM_DOMINIO = $Dominio

$python = if (Test-Path "$raiz\..\venv\Scripts\python.exe") { "$raiz\..\venv\Scripts\python.exe" } else { "python" }
Start-Process -FilePath $python -ArgumentList "servir.py" -WorkingDirectory $raiz -NoNewWindow
Write-Host "Unexuam escuchando en 127.0.0.1:$Puerto. Iniciando Caddy para https://$Dominio ..."
caddy run --config "$raiz\deploy\Caddyfile"
