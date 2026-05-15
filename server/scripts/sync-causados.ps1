# sync-causados.ps1
# Mueve archivos desde la carpeta local de causados al Archivo Contable en S:
# Ejecutar como tarea programada en Windows (cada 5 minutos o con disparador de carpeta)

$origen  = "D:\DocuPrex\server\uploads\archivo-contable"
$destino = "\\servidorw2k\Servicios_Compartidos\Z. Adtiva y Financiera\_Qprex Adtiva y Financiera\Archivo Contable"
$log     = "D:\DocuPrex\server\logs\sync-causados.log"

function Write-Log($msg) {
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    "$timestamp  $msg" | Out-File -FilePath $log -Append -Encoding utf8
}

if (-not (Test-Path $origen)) {
    Write-Log "INFO  Carpeta de origen no existe aun: $origen"
    exit 0
}

if (-not (Test-Path $destino)) {
    Write-Log "ERROR Destino S: no accesible: $destino"
    exit 1
}

# robocopy sincroniza la estructura completa, mueve archivos (copia + borra origen)
# /E  = incluye subcarpetas vacias
# /MOV = mueve (no copia) cada archivo
# /R:2 /W:5 = 2 reintentos, 5 segundos de espera
# /NP = sin barra de progreso
# /LOG+ = appends al log de robocopy
$robolog = "D:\DocuPrex\server\logs\robocopy-causados.log"

# Montar la ruta UNC si no está accesible (la tarea puede correr sin sesión de usuario)
if (-not (Test-Path $destino)) {
    net use "\\servidorw2k\Servicios_Compartidos" /persistent:no 2>$null | Out-Null
}

Write-Log "INFO  Iniciando sync de causados..."
$result = robocopy $origen $destino /E /R:2 /W:5 /NP /LOG+:$robolog

$exitCode = $LASTEXITCODE
if ($exitCode -le 7) {
    Write-Log "OK    Sync completado (robocopy exit $exitCode)"
} else {
    Write-Log "ERROR Sync con errores (robocopy exit $exitCode) - ver $robolog"
}
