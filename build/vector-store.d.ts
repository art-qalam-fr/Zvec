import type { CollectionConfig, SearchResult } from "./schemas.js";
export declare class VectorStore {
    createCollection(name: string, dimensions: number, distance?: "Cosine" | "Euclid" | "Dot", enableHybrid?: boolean): void;
    deleteCollection(name: string): void;
    collectionExists(name: string): boolean;
    listCollections(): CollectionConfig[];
    getCollectionInfo(name: string): CollectionConfig & {
        hybridEnabled: boolean;
    };
    addDocuments(collectionName: string, documents: Array<{
        id: string;
        text: string;
        vector: number[];
        metadata?: Record<string, unknown>;
    }>): void;
    deleteDocuments(collectionName: string, ids: string[]): void;
    search(collectionName: string, queryVector: number[], limit?: number, filter?: Record<string, unknown>): SearchResult[];
    hybridSearch(collectionName: string, queryVector: number[], queryText: string, limit?: number, filter?: Record<string, unknown>): SearchResult[];
    saveIndexState(collectionName: string, state: Record<string, unknown>): void;
    loadIndexState(collectionName: string): Record<string, unknown> | null;
    clearIndexState(collectionName: string): void;
    getDocumentCount(collectionName: string): number;
    invalidateCache(collectionName?: string): void;
}
//# sourceMappingURL=vector-store.d.ts.map