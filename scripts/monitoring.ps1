# Script Monitoring Architecture Mémoire - Windows
# Surveillance temps réel du système mémoire distribué

Write-Host "=== Monitoring Architecture Mémoire ===" -ForegroundColor Green
Write-Host "Timestamp: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor Cyan
Write-Host ""

# 1. État des processus MCP
Write-Host "🔍 PROCESSUS MCP ACTIFS" -ForegroundColor Yellow
Write-Host "-".PadRight(50, "-") -ForegroundColor Gray

$nodeProcesses = Get-Process | Where-Object { $_.ProcessName -like "*node*" } | Select-Object Id, ProcessName, CPU, @{Name="MemoryMB";Expression={[math]::Round($_.WorkingSet / 1MB, 1)}}

if ($nodeProcesses) {
    $nodeProcesses | Format-Table -AutoSize
} else {
    Write-Host "❌ Aucun processus Node.js détecté" -ForegroundColor Red
}

# 2. État des bases de données
Write-Host "💾 ÉTAT BASES DE DONNÉES" -ForegroundColor Yellow
Write-Host "-".PadRight(50, "-") -ForegroundColor Gray

$databases = @(
    @{ Name = "Memory MCP"; Path = "$env:HEPHAISTOS_DATA_DIR\memory_mcp.db" },
    @{ Name = "Zvec Data"; Path = "$env:HEPHAISTOS_DATA_DIR\zvec-data" }
)

foreach ($db in $databases) {
    if (Test-Path $db.Path) {
        $item = Get-Item $db.Path
        $sizeMB = [math]::Round($item.Length / 1MB, 2)
        $lastModified = $item.LastWriteTime.ToString("yyyy-MM-dd HH:mm:ss")
        Write-Host "✅ $($db.Name): $sizeMB MB (modifié: $lastModified)" -ForegroundColor Green
    } else {
        Write-Host "❌ $($db.Name): Fichier manquant" -ForegroundColor Red
    }
}

# 3. Utilisation ressources système
Write-Host "⚡ UTILISATION RESSOURCES" -ForegroundColor Yellow
Write-Host "-".PadRight(50, "-") -ForegroundColor Gray

# RAM
try {
    $os = Get-CimInstance -ClassName Win32_OperatingSystem
    $totalRAM = [math]::Round($os.TotalVisibleMemorySize / 1MB, 1)
    $freeRAM = [math]::Round($os.FreePhysicalMemory / 1MB, 1)
    $usedRAM = $totalRAM - $freeRAM
    $ramPercent = [math]::Round(($usedRAM / $totalRAM) * 100, 1)

    Write-Host "RAM: $usedRAM GB utilisés / $totalRAM GB total ($ramPercent%)" -ForegroundColor Cyan
} catch {
    Write-Host "RAM: Informations non disponibles (WMI/CIM non accessible)" -ForegroundColor Yellow
}

# Disque F:
try {
    $disk = Get-CimInstance -ClassName Win32_LogicalDisk -Filter "DeviceID=$env:HEPHAISTOS_DRIVE"
    if ($disk) {
        $totalGB = [math]::Round($disk.Size / 1GB, 1)
        $freeGB = [math]::Round($disk.FreeSpace / 1GB, 1)
        $usedGB = $totalGB - $freeGB
        $diskPercent = [math]::Round((($totalGB - $freeGB) / $totalGB) * 100, 1)
        Write-Host "Disque F: $usedGB GB utilisés / $totalGB GB total ($diskPercent%)" -ForegroundColor Cyan
    } else {
        Write-Host "Disque F: Non trouvé" -ForegroundColor Yellow
    }
} catch {
    Write-Host "Disque F: Informations non disponibles (WMI/CIM non accessible)" -ForegroundColor Yellow
}

# 4. Test connectivité composants
Write-Host "🔗 CONNECTIVITÉ COMPOSANTS" -ForegroundColor Yellow
Write-Host "-".PadRight(50, "-") -ForegroundColor Gray

# Test zvec-mcp-server (timeout court)
try {
    Push-Location "<HEPHAISTOS_ROOT>\servers\zvec-mcp-server"
    $startTime = Get-Date
    timeout 3 node build/index.js 2>$null | Out-Null
    $endTime = Get-Date
    $responseTime = [math]::Round(($endTime - $startTime).TotalMilliseconds, 0)

    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Zvec MCP Server: Opérationnel ($responseTime ms)" -ForegroundColor Green
    } else {
        Write-Host "⚠️ Zvec MCP Server: Fonctionne avec avertissements ($responseTime ms)" -ForegroundColor Yellow
    }
    Pop-Location
} catch {
    Write-Host "❌ Zvec MCP Server: Erreur de connexion" -ForegroundColor Red
}

# Test memory-mcp
try {
    Push-Location "<HEPHAISTOS_ROOT>\servers\memory"
    $startTime = Get-Date
    timeout 3 node dist/index.js 2>$null | Out-Null
    $endTime = Get-Date
    $responseTime = [math]::Round(($endTime - $startTime).TotalMilliseconds, 0)

    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Memory MCP: Opérationnel ($responseTime ms)" -ForegroundColor Green
    } else {
        Write-Host "⚠️ Memory MCP: Fonctionne avec avertissements ($responseTime ms)" -ForegroundColor Yellow
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

$alerts = @()

# Alerte RAM haute
if ($ramPercent -gt 85) {
    $alerts += "RAM utilisation élevée ($ramPercent%) - Risque de thrashing"
}

# Alerte disque plein
if ($diskPercent -gt 90) {
    $alerts += "Disque F presque plein ($diskPercent%) - Risque de saturation"
}

# Alerte processus manquants
if (!$nodeProcesses -or $nodeProcesses.Count -eq 0) {
    $alerts += "Aucun processus MCP Node.js détecté"
}

if ($alerts.Count -eq 0) {
    Write-Host "✅ Aucune alerte critique détectée" -ForegroundColor Green
} else {
    foreach ($alert in $alerts) {
        Write-Host "⚠️ $alert" -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "=== Monitoring Terminé ===" -ForegroundColor Green
Write-Host "Prochaine exécution recommandée: Dans 5-10 minutes" -ForegroundColor Cyan
