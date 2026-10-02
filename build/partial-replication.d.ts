import { VectorStore } from "./vector-store.js";
import { EmbeddingProvider } from "./embeddings.js";
interface ReplicationEvent {
    id: string;
    tableName: string;
    recordId: string | number;
    action: 'INSERT' | 'UPDATE' | 'DELETE';
    oldData?: any;
    newData?: any;
    timestamp: Date;
    source: 'memory' | 'zvec';
    syncType: 'hybrid_indexing' | 'critical_schema_sync';
}
interface SyncQueueItem {
    event: ReplicationEvent;
    retryCount: number;
    maxRetries: number;
    nextRetryAt: Date;
    status: 'pending' | 'processing' | 'completed' | 'failed';
}
declare class PartialReplicationManager {
    private store;
    private embeddings;
    private zvecClient;
    private memoryDb;
    private syncQueue;
    private isProcessing;
    private qdrantBridge?;
    private qdrantCollection;
    constructor(store: VectorStore, embeddings: EmbeddingProvider, zvecClient: any);
    private initializeQdrantBridge;
    private initializeMemoryConnection;
    private initializeTriggers;
    private startSyncProcessor;
    private processSyncQueue;
    private processReplicationEvent;
    private syncCriticalSchemas;
    private syncHybridIndexing;
    private syncEntityChange;
    private generateUuidFromId;
    private syncObservationChange;
    private indexDocumentInZvec;
    private deleteDocumentFromZvec;
    reconcileCollections(): Promise<void>;
    private reconcileMcpSchemas;
    private reconcileHybridIndex;
    shutdown(): Promise<void>;
}
export { PartialReplicationManager, ReplicationEvent, SyncQueueItem };
//# sourceMappingURL=partial-replication.d.ts.map