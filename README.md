<p align="center">
  <img src="https://raw.githubusercontent.com/art-qalam-fr/Hephaistos-Kit/main/logo/hephaistos-kit_banderole.jfif" alt="Hephaistos-Kit" width="640"/>
</p>

> Ce dépôt est un **composant MCP du [Hephaistos-Kit](https://github.com/art-qalam-fr/Hephaistos-Kit)** —
> utilisable seul, mais conçu pour être cloné en sous-module et installé via `mcp/install.ps1`.
>
> ✍️ Élaboré par **art-qalam-fr**.

---

# zvec-mcp-server

Serveur MCP de **recherche sémantique en mémoire** : indexation et requêtes
vectorielles via Zvec/HNSW, en local, sans service externe. Remplace Qdrant
pour les collections légères (entités, concepts, actions — 384 dimensions).

## Installation

```bash
npm install && npm run build
```

## Configuration

| Variable | Rôle |
|---|---|
| `ZVEC_DATA_DIR` | Dossier de persistance des index (requis) |
| `EMBEDDING_PROVIDER` | Fournisseur d'embeddings (requis) |

## Outils exposés

- `zvec_semantic_search` — recherche vectorielle sur les collections
  (`entities_index`, `concepts_index`, `actions_index`)

Licence MIT — voir le dépôt parent pour la stack complète.
