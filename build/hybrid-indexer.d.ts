import { VectorStore } from "./vector-store.js";
import { EmbeddingProvider } from "./embeddings.js";
interface HybridDocument {
    id: string;
    vector: number[];
    metadata: {
        entityType: string;
        entityName: string;
        relations: string[];
        observations: string[];
        tags: string[];
        lastModified: Date;
        source: 'memory' | 'zvec';
    };
    text: string;
    score?: number;
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
declare class HybridIndexer {
    private store;
    private embeddings;
    private memoryConnection;
    private sqlite;
    constructor(store: VectorStore, embeddings: EmbeddingProvider);
    setMemoryConnection(path: string): void;
    indexEntity(entityId: string, collectionName: string, options?: IndexingOptions): Promise<void>;
    unifiedSearch(collectionName: string, query: string, options: UnifiedSearchOptions): Promise<SearchResult[]>;
    private combineScores;
    private queryMemory;
    private connectToMemory;
    private disconnectFromMemory;
}
export { HybridIndexer, HybridDocument, IndexingOptions, UnifiedSearchOptions, SearchResult };
//# sourceMappingURL=hybrid-indexer.d.ts.map