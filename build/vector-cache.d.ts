import { VectorStore } from "./vector-store.js";
import { EmbeddingProvider } from "./embeddings.js";
interface SearchResult {
    id: string;
    score: number;
    text: string;
    metadata?: Record<string, unknown>;
}
interface VectorCacheConfig {
    maxSize: number;
    defaultTtl: number;
    redisUrl?: string;
    enableDistributed: boolean;
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
declare class VectorCache {
    private config;
    private store;
    private cache;
    private totalRequests;
    private hits;
    private misses;
    private evictions;
    constructor(config: VectorCacheConfig, store: VectorStore);
    get(query: string): Promise<SearchResult[] | null>;
    set(query: string, results: SearchResult[], ttl?: number): Promise<void>;
    invalidate(pattern: string): Promise<number>;
    searchWithCache(collectionName: string, query: string, options?: {
        limit?: number;
        embeddings?: EmbeddingProvider;
    }): Promise<SearchResult[]>;
    clear(): Promise<number>;
    getStats(): CacheStats;
    preloadFrequentQueries(collectionName: string, embeddings: EmbeddingProvider): Promise<void>;
    private generateCacheKey;
    private isValid;
    private evictLRU;
    private getFrequentQueries;
    private startCleanupInterval;
}
export { VectorCache, VectorCacheConfig, CacheStats, SearchResult };
//# sourceMappingURL=vector-cache.d.ts.map