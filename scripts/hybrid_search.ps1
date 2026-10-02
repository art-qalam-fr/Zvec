# Script Recherche Hybride - Architecture Mémoire
# Combinaison recherche sémantique + mots-clés avec BM25

param(
    [string]$Query = "optimisation performance",
    [int]$Limit = 10,
    [hashtable]$Filters = @{}
)

Write-Host "=== Recherche Hybride Architecture Mémoire ===" -ForegroundColor Green
Write-Host "Query: '$Query' | Limit: $Limit" -ForegroundColor Cyan
Write-Host ""

# Fonction recherche sémantique
function Search-Semantic {
    param([string]$query, [int]$limit)

    Write-Host "🔍 Recherche sémantique en cours..." -ForegroundColor Yellow

    # Simulation recherche vectorielle (à remplacer par vrai appel MCP)
    $results = @(
        @{ id = "doc_semantic_1"; score = 0.87; text = "Optimisation des performances système"; type = "semantic" },
        @{ id = "doc_semantic_2"; score = 0.76; text = "Amélioration vitesse traitement"; type = "semantic" },
        @{ id = "doc_semantic_3"; score = 0.65; text = "Performance et optimisation"; type = "semantic" }
    )

    return $results | Select-Object -First $limit
}

# Fonction recherche mots-clés (BM25-like)
function Search-Keywords {
    param([string]$query, [int]$limit)

    Write-Host "🔤 Recherche mots-clés (BM25) en cours..." -ForegroundColor Yellow

    $keywords = $query -split " "
    $results = @()

    # Simulation recherche par mots-clés
    foreach ($keyword in $keywords) {
        switch ($keyword) {
            "optimisation" {
                $results += @{ id = "doc_keyword_1"; score = 0.92; text = "Guide optimisation système"; type = "keyword"; keyword = $keyword }
                $results += @{ id = "doc_keyword_2"; score = 0.78; text = "Optimisation performance base"; type = "keyword"; keyword = $keyword }
            }
            "performance" {
                $results += @{ id = "doc_keyword_3"; score = 0.85; text = "Mesure performance applicative"; type = "keyword"; keyword = $keyword }
                $results += @{ id = "doc_keyword_4"; score = 0.71; text = "Performance et monitoring"; type = "keyword"; keyword = $keyword }
            }
        }
    }

    return $results | Select-Object -First $limit
}

# Fonction fusion résultats hybrides
function Merge-HybridResults {
    param([array]$semanticResults, [array]$keywordResults, [double]$semanticWeight = 0.7, [double]$keywordWeight = 0.3)

    Write-Host "🔄 Fusion résultats hybrides..." -ForegroundColor Yellow
    Write-Host "Poids: Sémantique=$(100*$semanticWeight)%, Mots-clés=$(100*$keywordWeight)%" -ForegroundColor Gray

    $allResults = @()
    $usedIds = @{}

    # Ajout résultats sémantiques
    foreach ($result in $semanticResults) {
        $hybridScore = $result.score * $semanticWeight
        $allResults += @{
            id = $result.id
            text = $result.text
            semantic_score = $result.score
            keyword_score = 0
            hybrid_score = $hybridScore
            type = "hybrid_semantic"
            sources = @("semantic")
        }
        $usedIds[$result.id] = $true
    }

    # Ajout résultats mots-clés
    foreach ($result in $keywordResults) {
        if ($usedIds.ContainsKey($result.id)) {
            # Mise à jour résultat existant
            $existing = $allResults | Where-Object { $_.id -eq $result.id }
            if ($existing) {
                $existing.keyword_score = $result.score
                $existing.hybrid_score = ($existing.semantic_score * $semanticWeight) + ($result.score * $keywordWeight)
                $existing.sources += "keyword"
                $existing.type = "hybrid_both"
            }
        } else {
            # Nouveau résultat
            $hybridScore = $result.score * $keywordWeight
            $allResults += @{
                id = $result.id
                text = $result.text
                semantic_score = 0
                keyword_score = $result.score
                hybrid_score = $hybridScore
                type = "hybrid_keyword"
                sources = @("keyword")
            }
        }
    }

    # Tri par score hybride décroissant
    return $allResults | Sort-Object -Property hybrid_score -Descending
}

# Fonction application filtres
function Apply-Filters {
    param([array]$results, [hashtable]$filters)

    if ($filters.Count -eq 0) {
        return $results
    }

    Write-Host "🔍 Application filtres: $($filters.Keys -join ', ')" -ForegroundColor Yellow

    $filteredResults = @()

    foreach ($result in $results) {
        $matches = $true

        foreach ($key in $filters.Keys) {
            if ($result.ContainsKey($key) -and $result[$key] -ne $filters[$key]) {
                $matches = $false
                break
            }
        }

        if ($matches) {
            $filteredResults += $result
        }
    }

    return $filteredResults
}

# Exécution recherche hybride principale
try {
    Write-Host "🚀 Démarrage recherche hybride..." -ForegroundColor Green
    Write-Host ""

    # 1. Recherche sémantique
    $semanticResults = Search-Semantic -query $Query -limit ($Limit * 2)
    Write-Host "📊 Résultats sémantiques: $($semanticResults.Count)" -ForegroundColor Cyan
    Write-Host ""

    # 2. Recherche mots-clés
    $keywordResults = Search-Keywords -query $Query -limit ($Limit * 2)
    Write-Host "📊 Résultats mots-clés: $($keywordResults.Count)" -ForegroundColor Cyan
    Write-Host ""

    # 3. Fusion hybride
    $hybridResults = Merge-HybridResults -semanticResults $semanticResults -keywordResults $keywordResults
    Write-Host "📊 Résultats hybrides avant filtrage: $($hybridResults.Count)" -ForegroundColor Cyan
    Write-Host ""

    # 4. Application filtres
    $finalResults = Apply-Filters -results $hybridResults -filters $Filters
    $finalResults = $finalResults | Select-Object -First $Limit

    # 5. Affichage résultats
    Write-Host "🎯 RÉSULTATS RECHERCHE HYBRIDE" -ForegroundColor Green
    Write-Host "=".PadRight(60, "=") -ForegroundColor Gray

    if ($finalResults.Count -eq 0) {
        Write-Host "❌ Aucun résultat trouvé" -ForegroundColor Yellow
    } else {
        for ($i = 0; $i -lt $finalResults.Count; $i++) {
            $result = $finalResults[$i]
            $rank = $i + 1

            Write-Host "$rank. $($result.text)" -ForegroundColor White
            Write-Host "   ID: $($result.id)" -ForegroundColor Gray
            Write-Host "   Score hybride: $([math]::Round($result.hybrid_score, 3))" -ForegroundColor Cyan
            Write-Host "   Scores: Sémantique $([math]::Round($result.semantic_score, 3)) | Mots-clés $([math]::Round($result.keyword_score, 3))" -ForegroundColor Gray
            Write-Host "   Sources: $($result.sources -join ' + ')" -ForegroundColor Magenta
            Write-Host ""
        }

        # Statistiques
        $semanticOnly = ($finalResults | Where-Object { $_.type -eq "hybrid_semantic" }).Count
        $keywordOnly = ($finalResults | Where-Object { $_.type -eq "hybrid_keyword" }).Count
        $both = ($finalResults | Where-Object { $_.type -eq "hybrid_both" }).Count

        Write-Host "📈 STATISTIQUES" -ForegroundColor Yellow
        Write-Host "-".PadRight(30, "-") -ForegroundColor Gray
        Write-Host "Sémantique uniquement: $semanticOnly" -ForegroundColor White
        Write-Host "Mots-clés uniquement: $keywordOnly" -ForegroundColor White
        Write-Host "Combinés (meilleurs): $both" -ForegroundColor White
        Write-Host "Total résultats: $($finalResults.Count)" -ForegroundColor White
    }

    Write-Host ""
    Write-Host "=== Recherche Hybride Terminée ===" -ForegroundColor Green

} catch {
    Write-Host "❌ Erreur recherche hybride: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "🔧 Vérifiez la configuration des composants" -ForegroundColor Yellow
}
