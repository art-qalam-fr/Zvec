import type { VectorStore } from "./vector-store.js";
import type { HnswVectorStore } from "./hnsw-store.js";
import { EmbeddingProvider } from "./embeddings.js";
export declare class CodeIndexer {
    private store;
    private embeddings;
    constructor(store: VectorStore | HnswVectorStore, embeddings: EmbeddingProvider);
    getCollectionName(path: string): string;
    indexCodebase(rootPath: string, options?: {
        forceReindex?: boolean;
        extensions?: string[];
        ignorePatterns?: string[];
    }): Promise<{
        totalFiles: number;
        totalChunks: number;
        collectionName: string;
    }>;
    searchCode(rootPath: string, query: string, options?: {
        limit?: number;
        fileTypes?: string[];
        pathPattern?: string;
    }): Promise<Array<{
        file: string;
        text: string;
        score: number;
        chunkIndex: number;
    }>>;
    reindexChanges(rootPath: string): Promise<{
        added: number;
        modified: number;
        deleted: number;
        totalChunks: number;
    }>;
    getIndexStatus(rootPath: string): {
        indexed: boolean;
        collectionName: string;
        stats?: {
            totalFiles: number;
            totalChunks: number;
            lastIndexed: string;
        };
    };
    clearIndex(rootPath: string): void;
    private matchGlob;
}
//# sourceMappingURL=code-indexer.d.ts.map