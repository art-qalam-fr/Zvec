# Script Backup Automatique - Architecture Mémoire
# Sauvegarde sécurisée des données critiques

param(
    [string]$BackupPath = "$env:HEPHAISTOS_BACKUP_DIR",
    [switch]$Compress = $true
)

Write-Host "=== Backup Architecture Mémoire ===" -ForegroundColor Green
Write-Host "Timestamp: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor Cyan
Write-Host ""

# Créer répertoire backup avec timestamp
$timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$backupDir = "$BackupPath\backup_$timestamp"

if (!(Test-Path $BackupPath)) {
    New-Item -ItemType Directory -Path $BackupPath -Force
    Write-Host "✅ Créé répertoire backup: $BackupPath" -ForegroundColor Green
}

New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
Write-Host "📁 Répertoire backup: $backupDir" -ForegroundColor Cyan

# Liste des fichiers/dossiers critiques à sauvegarder
$criticalItems = @(
    @{ Name = "Memory Database"; Path = "$env:HEPHAISTOS_DATA_DIR\memory_mcp.db"; Type = "file" },
    @{ Name = "Zvec Data"; Path = "$env:HEPHAISTOS_DATA_DIR\zvec-data"; Type = "directory" },
    @{ Name = "MCP Config"; Path = "<USERPROFILE>\.codeium\devin\mcp_config.json"; Type = "file" },
    @{ Name = "Global Rules"; Path = "<USERPROFILE>\.codeium\devin\memories\global_rules.md"; Type = "file" },
    @{ Name = "Scripts Infrastructure"; Path = "<HEPHAISTOS_ROOT>\scripts"; Type = "directory" },
    @{ Name = "Documentation Futures"; Path = "<HEPHAISTOS_ROOT>\Futures"; Type = "directory" }
)

$totalSize = 0
$backedUpItems = 0

Write-Host "🔄 Sauvegarde en cours..." -ForegroundColor Yellow
Write-Host "-".PadRight(60, "-") -ForegroundColor Gray

foreach ($item in $criticalItems) {
    try {
        $sourcePath = $item.Path
        $itemName = Split-Path $sourcePath -Leaf
        $destPath = "$backupDir\$itemName"

        if (Test-Path $sourcePath) {
            # Calculer taille avant copie
            if ($item.Type -eq "file") {
                $size = (Get-Item $sourcePath).Length
            } else {
                $size = (Get-ChildItem $sourcePath -Recurse -File | Measure-Object -Property Length -Sum).Sum
            }

            # Copier
            if ($item.Type -eq "file") {
                Copy-Item $sourcePath $destPath
            } else {
                Copy-Item $sourcePath $destPath -Recurse
            }

            $sizeMB = [math]::Round($size / 1MB, 2)
            $totalSize += $size
            $backedUpItems++

            Write-Host "✅ $($item.Name): $sizeMB MB sauvegardés" -ForegroundColor Green
        } else {
            Write-Host "⚠️ $($item.Name): Source introuvable ($sourcePath)" -ForegroundColor Yellow
        }
    } catch {
        Write-Host "❌ Erreur sauvegarde $($item.Name): $($_.Exception.Message)" -ForegroundColor Red
    }
}

# Statistiques
$totalSizeMB = [math]::Round($totalSize / 1MB, 2)
Write-Host ""
Write-Host "📊 STATISTIQUES BACKUP" -ForegroundColor Yellow
Write-Host "-".PadRight(30, "-") -ForegroundColor Gray
Write-Host "Éléments sauvegardés: $backedUpItems" -ForegroundColor Cyan
Write-Host "Taille totale: $totalSizeMB MB" -ForegroundColor Cyan
Write-Host "Répertoire backup: $backupDir" -ForegroundColor Cyan

# Compression optionnelle
if ($Compress) {
    Write-Host ""
    Write-Host "🗜️ Compression du backup..." -ForegroundColor Yellow

    $zipFile = "$BackupPath\backup_$timestamp.zip"
    try {
        Compress-Archive -Path $backupDir -DestinationPath $zipFile -CompressionLevel Optimal
        $zipSizeMB = [math]::Round((Get-Item $zipFile).Length / 1MB, 2)
        $compressionRatio = [math]::Round(($totalSizeMB - $zipSizeMB) / $totalSizeMB * 100, 1)

        Write-Host "✅ Archive créée: $zipFile" -ForegroundColor Green
        Write-Host "Taille compressée: $zipSizeMB MB (réduction: $compressionRatio%)" -ForegroundColor Green

        # Supprimer répertoire non compressé
        Remove-Item $backupDir -Recurse -Force
        Write-Host "🗑️ Répertoire temporaire supprimé" -ForegroundColor Gray

    } catch {
        Write-Host "⚠️ Échec compression: $($_.Exception.Message)" -ForegroundColor Yellow
        Write-Host "Backup conservé non compressé: $backupDir" -ForegroundColor Yellow
    }
}

# Nettoyage anciens backups (garder 10 plus récents)
Write-Host ""
Write-Host "🧹 Nettoyage anciens backups..." -ForegroundColor Yellow

$existingBackups = Get-ChildItem $BackupPath -Filter "backup_*.zip" | Sort-Object LastWriteTime -Descending
if ($existingBackups.Count -gt 10) {
    $toDelete = $existingBackups | Select-Object -Skip 10
    foreach ($oldBackup in $toDelete) {
        Remove-Item $oldBackup.FullName -Force
        Write-Host "🗑️ Supprimé backup ancien: $($oldBackup.Name)" -ForegroundColor Gray
    }
}

Write-Host ""
Write-Host "=== Backup Terminé avec Succès ===" -ForegroundColor Green
Write-Host "🔒 Données critiques sauvegardées et sécurisées" -ForegroundColor Cyan

# Recommandation prochaine sauvegarde
$nextBackup = (Get-Date).AddDays(1).ToString("yyyy-MM-dd à HH:mm")
Write-Host "📅 Prochaine sauvegarde automatique recommandée: $nextBackup" -ForegroundColor White
