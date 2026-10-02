// Architecture de cache vectoriel - Cache haute performance pour Zvec
import { VectorStore } from "./vector-store.js";
import { EmbeddingProvider } from "./embeddings.js";

interface CachedResult {
  query: string;
  results: SearchResult[];
  timestamp: Date;
  ttl: number; // Time to live en secondes
  hitCount: number; // Nombre d'accès pour LRU
}

interface SearchResult {
  id: string;
  score: number;
  text: string;
  metadata?: Record<string, unknown>;
}

interface VectorCacheConfig {
  maxSize: number; // Taille maximale du cache
  defaultTtl: number; // TTL par défaut
  redisUrl?: string; // URL Redis pour cache distribué
  enableDistributed: boolean; // Cache distribué activé
}

interface CacheStats {
  size: number;
  maxSize: number;
  hitRate: number;
  totalRequests: number;
  hits: number;
  misses: number;
  evictions: number;
  defaultTtl: number;
}

class VectorCache {
  private cache: Map<string, CachedResult> = new Map();
  private totalRequests = 0;
  private hits = 0;
  private misses = 0;
  private evictions = 0;

  constructor(
    private config: VectorCacheConfig,
    private store: VectorStore
  ) {
    this.startCleanupInterval();
  }

  // Récupérer résultat depuis cache
  async get(query: string): Promise<SearchResult[] | null> {
    this.totalRequests++;
    const cacheKey = this.generateCacheKey(query);
    const cached = this.cache.get(cacheKey);

    if (cached && this.isValid(cached)) {
      cached.hitCount++;
      this.hits++;
      return cached.results;
    }

    // Nettoyer entrée expirée
    if (cached && !this.isValid(cached)) {
      this.cache.delete(cacheKey);
      this.evictions++;
    }

    this.misses++;
    return null;
  }

  // Stocker résultat en cache
  async set(query: string, results: SearchResult[], ttl?: number): Promise<void> {
    const cacheKey = this.generateCacheKey(query);
    const cacheEntry: CachedResult = {
      query,
      results,
      timestamp: new Date(),
      ttl: ttl || this.config.defaultTtl,
      hitCount: 1
    };

    // Gestion de la taille maximale (LRU)
    if (this.cache.size >= this.config.maxSize) {
      this.evictLRU();
    }

    this.cache.set(cacheKey, cacheEntry);
  }

  // Invalidation intelligente avec pattern matching
  async invalidate(pattern: string): Promise<number> {
    let invalidatedCount = 0;
    const regex = new RegExp(pattern.replace(/\*/g, '.*').replace(/\?/g, '.'));

    for (const [key, entry] of this.cache.entries()) {
      if (regex.test(entry.query)) {
        this.cache.delete(key);
        invalidatedCount++;
      }
    }

    return invalidatedCount;
  }

  // Recherche avec cache intégré
  async searchWithCache(
    collectionName: string,
    query: string,
    options: {
      limit?: number;
      embeddings?: EmbeddingProvider;
    } = {}
  ): Promise<SearchResult[]> {
    const limit = options.limit || 5;

    // Vérifier cache d'abord
    const cachedResults = await this.get(query);
    if (cachedResults) {
      return cachedResults.slice(0, limit);
    }

    // Recherche normale
    if (!options.embeddings) {
      throw new Error("Embeddings provider required for cache miss");
    }

    const { embedding } = await options.embeddings.embed(query);
    const results = this.store.search(collectionName, embedding, limit * 2); // Plus de résultats pour filtrage

    // Mettre en cache si résultats pertinents
    if (results.length > 0) {
      await this.set(query, results);
    }

    return results.slice(0, limit);
  }

  // Vider complètement le cache
  async clear(): Promise<number> {
    const clearedCount = this.cache.size;
    this.cache.clear();
    this.evictions += clearedCount;
    return clearedCount;
  }

  // Statistiques du cache
  getStats(): CacheStats {
    const totalRequests = this.totalRequests;
    const hitRate = totalRequests > 0 ? (this.hits / totalRequests) * 100 : 0;

    return {
      size: this.cache.size,
      maxSize: this.config.maxSize,
      hitRate,
      totalRequests,
      hits: this.hits,
      misses: this.misses,
      evictions: this.evictions,
      defaultTtl: this.config.defaultTtl
    };
  }

  // Préchargement intelligent de requêtes fréquentes
  async preloadFrequentQueries(collectionName: string, embeddings: EmbeddingProvider): Promise<void> {
    // Identifier les requêtes les plus fréquentes et les précharger
    const frequentQueries = this.getFrequentQueries(10);

    for (const query of frequentQueries) {
      // Vérifier si toujours valide
      const cached = this.cache.get(this.generateCacheKey(query));
      if (!cached || !this.isValid(cached)) {
        // Recharger depuis le store
        const { embedding } = await embeddings.embed(query);
        const results = this.store.search(collectionName, embedding, 5);
        await this.set(query, results);
      }
    }
  }

  private generateCacheKey(query: string): string {
    return `zvec_cache_${query.toLowerCase().replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '')}`;
  }

  private isValid(entry: CachedResult): boolean {
    const age = Date.now() - entry.timestamp.getTime();
    return age < (entry.ttl * 1000);
  }

  private evictLRU(): void {
    let oldestKey = '';
    let oldestHits = Infinity;
    let oldestTime = Date.now();

    for (const [key, entry] of this.cache.entries()) {
      // Priorité aux entrées avec le moins d'accès, puis aux plus anciennes
      if (entry.hitCount < oldestHits ||
          (entry.hitCount === oldestHits && entry.timestamp.getTime() < oldestTime)) {
        oldestHits = entry.hitCount;
        oldestTime = entry.timestamp.getTime();
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
      this.evictions++;
    }
  }

  private getFrequentQueries(limit: number): string[] {
    // Retourner les requêtes les plus fréquemment utilisées
    const sortedEntries = Array.from(this.cache.entries())
      .sort((a, b) => b[1].hitCount - a[1].hitCount);

    return sortedEntries.slice(0, limit).map(([_, entry]) => entry.query);
  }

  private startCleanupInterval(): void {
    setInterval(() => {
      const now = Date.now();
      const toDelete: string[] = [];

      for (const [key, entry] of this.cache.entries()) {
        if (!this.isValid(entry)) {
          toDelete.push(key);
        }
      }

      for (const key of toDelete) {
        this.cache.delete(key);
        this.evictions++;
      }
    }, 30000); // Nettoyage toutes les 30 secondes
  }
}

export { VectorCache, VectorCacheConfig, CacheStats, SearchResult };

// Middleware pour intégration transparente
class VectorCacheMiddleware {
  constructor(private cache: VectorCache) {}

  async intercept(collection: string, query: string, options?: any) {
    return await this.cache.searchWithCache(collection, query, options);
  }
}
