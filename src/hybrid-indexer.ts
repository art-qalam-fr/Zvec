// Architecture d'indexation hybride - Extension Zvec
import { VectorStore } from "./vector-store.js";
import { EmbeddingProvider } from "./embeddings.js";

interface HybridDocument {
  id: string;
  vector: number[]; // Vecteur sémantique (384 dimensions)
  metadata: {
    entityType: string; // Type d'entité (user, global_rules, etc.)
    entityName: string; // Nom de l'entité
    relations: string[]; // Relations avec autres entités
    observations: string[]; // Observations associées
    tags: string[]; // Tags pour classification
    lastModified: Date; // Dernière modification
    source: 'memory' | 'zvec'; // Source des données
  };
  text: string; // Contenu textuel pour recherche full-text
  score?: number; // Score de pertinence
}

interface IndexingOptions {
  includeObservations: boolean;
  includeRelations: boolean;
}

interface UnifiedSearchOptions {
  entityType?: string;
  tags?: string[];
  limit: number;
  combineScores: boolean;
}

interface SearchResult {
  id: string;
  score: number;
  text: string;
  metadata?: HybridDocument['metadata'];
}

class HybridIndexer {
  private memoryConnection: string = process.env.MEMORY_DB || "./data/memory_mcp.db";
  private sqlite: any = null;

  constructor(
    private store: VectorStore,
    private embeddings: EmbeddingProvider
  ) {}

  // Configuration de la connexion Memory
  setMemoryConnection(path: string): void {
    this.memoryConnection = path;
    // TODO: Initialize SQLite connection
    console.error(`Memory connection set to: ${path}`);
  }

  // Indexation d'une entité Memory dans une collection hybride
  async indexEntity(
    entityId: string,
    collectionName: string,
    options: IndexingOptions = { includeObservations: true, includeRelations: true }
  ): Promise<void> {
    // Simulation de connexion SQLite (à implémenter avec vraie connexion)
    // const entity = await this.queryMemory(`SELECT * FROM entities WHERE id = ?`, [entityId]);

    // Données simulées pour démonstration
    const mockEntity = {
      id: entityId,
      name: `Entity ${entityId}`,
      entityType: 'test_entity',
      created_at: new Date().toISOString()
    };

    const mockObservations = [
      { content: `Observation 1 for entity ${entityId}` },
      { content: `Observation 2 for entity ${entityId}` },
      { content: `Technical details for ${entityId}` }
    ];

    // Construction du contenu hybride
    let textContent = mockEntity.name;

    if (options.includeObservations) {
      textContent += ' ' + mockObservations.map(o => o.content).join(' ');
    }

    // Génération du vecteur
    const { embedding } = await this.embeddings.embed(textContent);

    // Création du document hybride
    const hybridDoc: HybridDocument = {
      id: `hybrid_${entityId}`,
      vector: embedding,
      metadata: {
        entityType: mockEntity.entityType,
        entityName: mockEntity.name,
        relations: options.includeRelations ? [`relation_${entityId}_1`] : [],
        observations: options.includeObservations ? mockObservations.map(o => o.content) : [],
        tags: ['indexed', 'hybrid', mockEntity.entityType],
        lastModified: new Date(),
        source: 'memory'
      },
      text: textContent
    };

    // Indexation dans la collection vectorielle
    this.store.addDocuments(collectionName, [{
      id: hybridDoc.id,
      text: hybridDoc.text,
      vector: hybridDoc.vector,
      metadata: hybridDoc.metadata
    }]);
  }

  // Recherche unifiée hybride
  async unifiedSearch(
    collectionName: string,
    query: string,
    options: UnifiedSearchOptions
  ): Promise<SearchResult[]> {
    // Génération du vecteur de requête
    const { embedding } = await this.embeddings.embed(query);

    // Recherche vectorielle de base
    const vectorResults = this.store.search(collectionName, embedding, options.limit * 2); // Plus de résultats pour filtrage

    // Filtrage et enrichissement des résultats
    let filteredResults = vectorResults;

    // Filtrage par entityType
    if (options.entityType) {
      filteredResults = filteredResults.filter(r =>
        (r.metadata as any)?.entityType === options.entityType
      );
    }

    // Filtrage par tags
    if (options.tags && options.tags.length > 0) {
      filteredResults = filteredResults.filter(r => {
        const docTags = (r.metadata as any)?.tags || [];
        return options.tags!.some(tag => docTags.includes(tag));
      });
    }

    // Combinaison des scores si demandé
    if (options.combineScores) {
      filteredResults = this.combineScores(filteredResults, embedding, query);
    }

    // Limitation finale
    return filteredResults.slice(0, options.limit).map(r => ({
      id: r.id,
      score: r.score,
      text: r.text,
      metadata: r.metadata as HybridDocument['metadata']
    }));
  }

  // Combinaison intelligente des scores vectoriels et textuels
  private combineScores(
    results: any[],
    queryEmbedding: number[],
    queryText: string
  ): any[] {
    return results.map(result => {
      let combinedScore = result.score; // Score vectoriel de base

      const metadata = result.metadata as HybridDocument['metadata'];

      // Bonus pour correspondance d'entityType
      if (metadata?.entityType) {
        combinedScore += 0.1;
      }

      // Bonus pour tags pertinents
      if (metadata?.tags && metadata.tags.length > 0) {
        combinedScore += 0.05 * metadata.tags.length;
      }

      // Bonus pour observations récentes
      if (metadata?.lastModified) {
        const daysSinceModified = (Date.now() - new Date(metadata.lastModified).getTime()) / (1000 * 60 * 60 * 24);
        if (daysSinceModified < 7) {
          combinedScore += 0.2; // Bonus pour contenu récent
        }
      }

      return { ...result, score: combinedScore };
    }).sort((a, b) => b.score - a.score); // Tri par score combiné
  }

  // Méthodes utilitaires pour connexion Memory (à implémenter)
  private async queryMemory(sql: string, params: any[] = []): Promise<any[]> {
    // TODO: Implémenter vraie connexion SQLite
    console.error(`Would execute: ${sql} with params:`, params);
    return [];
  }

  private async connectToMemory(): Promise<void> {
    // TODO: Implémenter connexion SQLite
    console.error(`Connecting to Memory at: ${this.memoryConnection}`);
  }

  private async disconnectFromMemory(): Promise<void> {
    // TODO: Implémenter déconnexion SQLite
    console.error('Disconnecting from Memory');
  }
}

export { HybridIndexer, HybridDocument, IndexingOptions, UnifiedSearchOptions, SearchResult };
