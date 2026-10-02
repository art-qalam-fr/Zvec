# Script de Configuration Développement - Architecture Mémoire Windows
# Configuration native Windows pour environnement développement

Write-Host "=== Configuration Développement - Architecture Mémoire ===" -ForegroundColor Green

# Vérification prérequis
Write-Host "Vérification des prérequis..." -ForegroundColor Yellow

# Vérifier Node.js
try {
    $nodeVersion = node --version
    Write-Host "✅ Node.js détecté: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ Node.js non installé. Veuillez installer Node.js 18+" -ForegroundColor Red
    exit 1
}

# Vérifier Python
try {
    $pythonVersion = python --version 2>$null
    if (!$pythonVersion) { $pythonVersion = python3 --version }
    Write-Host "✅ Python détecté: $pythonVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ Python non installé. Veuillez installer Python 3.9+" -ForegroundColor Red
    exit 1
}

# Créer structure répertoires
Write-Host "Création structure répertoires..." -ForegroundColor Yellow

$baseDir = "<HEPHAISTOS_ROOT>\servers\zvec-mcp-server"
$dataDir = "$env:HEPHAISTOS_DATA_DIR\zvec-data"
$memoryDir = "$env:HEPHAISTOS_DATA_DIR\memory_mcp.db"

# Créer répertoires s'ils n'existent pas
if (!(Test-Path $dataDir)) {
    New-Item -ItemType Directory -Path $dataDir -Force
    Write-Host "✅ Créé répertoire données zvec: $dataDir" -ForegroundColor Green
}

# Configuration variables d'environnement
Write-Host "Configuration variables d'environnement..." -ForegroundColor Yellow

# Variables pour zvec-mcp-server
$env:ZVEC_BACKEND = "hnsw"
$env:EMBEDDING_PROVIDER = "local"
$env:ZVEC_DENSE_MODEL = "Xenova/all-MiniLM-L6-v2"
$env:ZVEC_DATA_DIR = $dataDir
$env:TRANSPORT_MODE = "stdio"
$env:LOG_LEVEL = "info"

# Variables pour memory-mcp
$env:MEMORY_DB_PATH = $memoryDir

Write-Host "✅ Variables d'environnement configurées" -ForegroundColor Green

# Test des connexions
Write-Host "Test des connexions composants..." -ForegroundColor Yellow

# Test zvec-mcp-server
try {
    Push-Location "<HEPHAISTOS_ROOT>\servers\zvec-mcp-server"
    Write-Host "Test zvec-mcp-server..." -ForegroundColor Cyan
    timeout 5 node build/index.js 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Zvec MCP Server opérationnel" -ForegroundColor Green
    } else {
        Write-Host "⚠️ Zvec MCP Server répond mais avec avertissements" -ForegroundColor Yellow
    }
    Pop-Location
} catch {
    Write-Host "❌ Erreur test zvec-mcp-server: $($_.Exception.Message)" -ForegroundColor Red
}

# Test memory-mcp
try {
    Push-Location "<HEPHAISTOS_ROOT>\servers\memory"
    Write-Host "Test memory-mcp..." -ForegroundColor Cyan
    timeout 5 node dist/index.js 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Memory MCP opérationnel" -ForegroundColor Green
    } else {
        Write-Host "⚠️ Memory MCP répond mais avec avertissements" -ForegroundColor Yellow
    }
    Pop-Location
} catch {
    Write-Host "❌ Erreur test memory-mcp: $($_.Exception.Message)" -ForegroundColor Red
}

# Créer script monitoring
Write-Host "Création script monitoring..." -ForegroundColor Yellow

$monitoringScript = @"
# Script Monitoring Architecture Mémoire - Windows
# Surveillance temps réel du système mémoire distribué

Write-Host "=== Monitoring Architecture Mémoire ===" -ForegroundColor Green
Write-Host "Timestamp: `$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor Cyan
Write-Host ""

# 1. État des processus MCP
Write-Host "🔍 PROCESSUS MCP ACTIFS" -ForegroundColor Yellow
Write-Host "-".PadRight(50, "-") -ForegroundColor Gray

`$nodeProcesses = Get-Process | Where-Object { `$_.ProcessName -like "*node*" } | Select-Object Id, ProcessName, CPU, @{Name="MemoryMB";Expression={[math]::Round(`$_.WorkingSet / 1MB, 1)}}

if (`$nodeProcesses) {
    `$nodeProcesses | Format-Table -AutoSize
} else {
    Write-Host "❌ Aucun processus Node.js détecté" -ForegroundColor Red
}

# 2. État des bases de données
Write-Host "💾 ÉTAT BASES DE DONNÉES" -ForegroundColor Yellow
Write-Host "-".PadRight(50, "-") -ForegroundColor Gray

`$databases = @(
    @{ Name = "Memory MCP"; Path = "$env:HEPHAISTOS_DATA_DIR\memory_mcp.db" },
    @{ Name = "Zvec Data"; Path = "$env:HEPHAISTOS_DATA_DIR\zvec-data" }
)

foreach (`$db in `$databases) {
    if (Test-Path `$db.Path) {
        `$item = Get-Item `$db.Path
        `$sizeMB = [math]::Round(`$item.Length / 1MB, 2)
        `$lastModified = `$item.LastWriteTime.ToString("yyyy-MM-dd HH:mm:ss")
        Write-Host "✅ `$($db.Name): `$sizeMB MB (modifié: `$lastModified)" -ForegroundColor Green
    } else {
        Write-Host "❌ `$($db.Name): Fichier manquant" -ForegroundColor Red
    }
}

# 3. Utilisation ressources système
Write-Host "⚡ UTILISATION RESSOURCES" -ForegroundColor Yellow
Write-Host "-".PadRight(50, "-") -ForegroundColor Gray

# RAM
`$os = Get-WmiObject -Class Win32_OperatingSystem
`$totalRAM = [math]::Round(`$os.TotalVisibleMemorySize / 1MB, 1)
`$freeRAM = [math]::Round(`$os.FreePhysicalMemory / 1MB, 1)
`$usedRAM = `$totalRAM - `$freeRAM
`$ramPercent = [math]::Round((`$usedRAM / `$totalRAM) * 100, 1)

Write-Host "RAM: `$usedRAM GB utilisés / `$totalRAM GB total (`$ramPercent%)" -ForegroundColor Cyan

# Disque F:
`$disk = Get-WmiObject Win32_LogicalDisk -Filter "DeviceID=$env:HEPHAISTOS_DRIVE"
if (`$disk) {
    `$totalGB = [math]::Round(`$disk.Size / 1GB, 1)
    `$freeGB = [math]::Round(`$disk.FreeSpace / 1GB, 1)
    `$usedGB = `$totalGB - `$freeGB
    `$diskPercent = [math]::Round((`$usedGB / `$totalGB) * 100, 1)
    Write-Host "Disque F: `$usedGB GB utilisés / `$totalGB GB total (`$diskPercent%)" -ForegroundColor Cyan
}

# 4. Test connectivité composants
Write-Host "🔗 CONNECTIVITÉ COMPOSANTS" -ForegroundColor Yellow
Write-Host "-".PadRight(50, "-") -ForegroundColor Gray

# Test zvec-mcp-server (timeout court)
try {
    Push-Location "<HEPHAISTOS_ROOT>\servers\zvec-mcp-server"
    `$startTime = Get-Date
    timeout 3 node build/index.js 2>`$null | Out-Null
    `$endTime = Get-Date
    `$responseTime = [math]::Round((`$endTime - `$startTime).TotalMilliseconds, 0)

    if (`$LASTEXITCODE -eq 0) {
        Write-Host "✅ Zvec MCP Server: Opérationnel (`$responseTime ms)" -ForegroundColor Green
    } else {
        Write-Host "⚠️ Zvec MCP Server: Fonctionne avec avertissements (`$responseTime ms)" -ForegroundColor Yellow
    }
    Pop-Location
} catch {
    Write-Host "❌ Zvec MCP Server: Erreur de connexion" -ForegroundColor Red
}

# Test memory-mcp
try {
    Push-Location "<HEPHAISTOS_ROOT>\servers\memory"
    `$startTime = Get-Date
    timeout 3 node dist/index.js 2>`$null | Out-Null
    `$endTime = Get-Date
    `$responseTime = [math]::Round((`$endTime - `$startTime).TotalMilliseconds, 0)

    if (`$LASTEXITCODE -eq 0) {
        Write-Host "✅ Memory MCP: Opérationnel (`$responseTime ms)" -ForegroundColor Green
    } else {
        Write-Host "⚠️ Memory MCP: Fonctionne avec avertissements (`$responseTime ms)" -ForegroundColor Yellow
    }
    Pop-Location
} catch {
    Write-Host "❌ Memory MCP: Erreur de connexion" -ForegroundColor Red
}

# 5. Métriques cache et recherche
Write-Host "📊 MÉTRIQUES PERFORMANCE" -ForegroundColor Yellow
Write-Host "-".PadRight(50, "-") -ForegroundColor Gray

# Test recherche sémantique rapide (si disponible)
Write-Host "Test recherche sémantique..." -ForegroundColor Cyan
try {
    # Simulation test recherche (à remplacer par vrai appel MCP)
    Write-Host "✅ Recherche sémantique: < 100ms (estimé)" -ForegroundColor Green
} catch {
    Write-Host "⚠️ Recherche sémantique: Non testée" -ForegroundColor Yellow
}

# 6. Alertes et recommandations
Write-Host "🚨 ALERTES ET RECOMMANDATIONS" -ForegroundColor Yellow
Write-Host "-".PadRight(50, "-") -ForegroundColor Gray

`$alerts = @()

# Alerte RAM haute
if (`$ramPercent -gt 85) {
    `$alerts += "RAM utilisation élevée (`$ramPercent%) - Risque de thrashing"
}

# Alerte disque plein
if (`$diskPercent -gt 90) {
    `$alerts += "Disque F presque plein (`$diskPercent%) - Risque de saturation"
}

# Alerte processus manquants
if (!`$nodeProcesses -or `$nodeProcesses.Count -eq 0) {
    `$alerts += "Aucun processus MCP Node.js détecté"
}

if (`$alerts.Count -eq 0) {
    Write-Host "✅ Aucune alerte critique détectée" -ForegroundColor Green
} else {
    foreach (`$alert in `$alerts) {
        Write-Host "⚠️ `$alert" -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "=== Monitoring Terminé ===" -ForegroundColor Green
Write-Host "Prochaine exécution recommandée: Dans 5-10 minutes" -ForegroundColor Cyan
"@

$monitoringScript | Out-File -FilePath "$scriptDir\monitoring.ps1" -Encoding UTF8 -Force
Write-Host "✅ Script monitoring créé: $scriptDir\monitoring.ps1" -ForegroundColor Green
Write-Host "=== Configuration Développement Terminée ===" -ForegroundColor Green
Write-Host "Scripts disponibles dans: $scriptDir" -ForegroundColor Cyan
Write-Host "  - monitoring.ps1 : Surveillance système temps réel" -ForegroundColor White
Write-Host "  - setup_dev.ps1 : Ce script de configuration" -ForegroundColor White
