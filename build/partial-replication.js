import Database from 'better-sqlite3';
import fetch from 'node-fetch';
// Client minimaliste pour Qdrant (optionnel)
class QdrantBridge {
    baseUrl;
    vectorSize;
    defaultCollection;
    distance;
    constructor(baseUrl, defaultCollection, vectorSize, distance = 'Cosine') {
        this.baseUrl = baseUrl;
        this.vectorSize = vectorSize;
        this.defaultCollection = defaultCollection;
        this.distance = distance;
    }
    async ensureCollection(name) {
        const url = `${this.baseUrl}/collections/${name}`;
        const res = await fetch(url);
        if (res.ok)
            return;
        if (res.status !== 404) {
            throw new Error(`Qdrant collection check failed: ${res.status} ${res.statusText}`);
        }
        const createRes = await fetch(`${this.baseUrl}/collections/${name}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                vectors: {
                    size: this.vectorSize,
                    distance: this.distance
                }
            })
        });
        if (!createRes.ok && createRes.status !== 409) {
            throw new Error(`Qdrant collection create failed: ${createRes.status} ${createRes.statusText}`);
        }
    }
    async upsertDocuments(collection, docs) {
        const target = collection || this.defaultCollection;
        await this.ensureCollection(target);
        const res = await fetch(`${this.baseUrl}/collections/${target}/points`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ points: docs.map(d => ({ id: d.id, vector: d.vector, payload: d.payload })) })
        });
        if (!res.ok) {
            throw new Error(`Qdrant upsert failed: ${res.status} ${res.statusText}`);
        }
    }
    async deleteDocuments(collection, ids) {
        const target = collection || this.defaultCollection;
        await this.ensureCollection(target);
        const res = await fetch(`${this.baseUrl}/collections/${target}/points/delete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ points: ids })
        });
        if (!res.ok) {
            throw new Error(`Qdrant delete failed: ${res.status} ${res.statusText}`);
        }
    }
}
class PartialReplicationManager {
    store;
    embeddings;
    zvecClient;
    memoryDb = null;
    syncQueue = [];
    isProcessing = false;
    qdrantBridge;
    qdrantCollection = 'memory_hybrid';
    constructor(store, embeddings, zvecClient // TODO: Proper typing
    ) {
        this.store = store;
        this.embeddings = embeddings;
        this.zvecClient = zvecClient;
        this.initializeMemoryConnection();
        this.initializeQdrantBridge();
        this.initializeTriggers();
        this.startSyncProcessor();
    }
    // Initialiser le bridge Qdrant si activé par env
    initializeQdrantBridge() {
        const enabled = (process.env.QDRANT_BRIDGE_ENABLED || 'false').toLowerCase() === 'true';
        if (!enabled)
            return;
        const baseUrl = process.env.QDRANT_URL || 'http://localhost:6333';
        const collection = process.env.QDRANT_COLLECTION || 'memory_hybrid';
        this.qdrantCollection = collection;
        try {
            const dimensions = this.embeddings.getDimensions();
            this.qdrantBridge = new QdrantBridge(baseUrl, collection, dimensions, 'Cosine');
            console.error(`[QdrantBridge] Activé pour ${collection} @ ${baseUrl}`);
        }
        catch (error) {
            console.error('[QdrantBridge] Initialisation échouée, bridge désactivé :', error);
            this.qdrantBridge = undefined;
        }
    }
    // Initialiser la connexion à la base Memory
    async initializeMemoryConnection() {
        const dbPath = process.env.MEMORY_DB || process.env.MEMORY_DB || "./data/memory_mcp.db";
        try {
            this.memoryDb = new Database(dbPath);
            console.error('Connecté à Memory DB pour réplication');
        }
        catch (error) {
            console.error('Erreur connexion Memory DB:', error);
        }
    }
    // Initialiser les déclencheurs SQL dans Memory
    async initializeTriggers() {
        if (!this.memoryDb)
            return;
        // Créer la table sync_queue si elle n'existe pas
        const createQueueTable = `
      CREATE TABLE IF NOT EXISTS sync_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_data TEXT NOT NULL,
        retry_count INTEGER DEFAULT 0,
        max_retries INTEGER DEFAULT 3,
        next_retry_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        status TEXT DEFAULT 'pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_sync_queue_status_retry
      ON sync_queue(status, next_retry_at);
    `;
        try {
            this.memoryDb.exec(createQueueTable);
            console.error('Table sync_queue initialisée');
        }
        catch (error) {
            console.error('Erreur création table sync_queue:', error);
        }
    }
    // Traiter la queue de synchronisation
    startSyncProcessor() {
        setInterval(async () => {
            if (this.isProcessing || !this.memoryDb)
                return;
            this.isProcessing = true;
            try {
                await this.processSyncQueue();
            }
            catch (error) {
                console.error('Erreur traitement sync queue:', error);
            }
            finally {
                this.isProcessing = false;
            }
        }, 5000); // Traitement toutes les 5 secondes
    }
    async processSyncQueue() {
        if (!this.memoryDb)
            return;
        // Récupérer événements en attente
        const query = `
      SELECT * FROM sync_queue
      WHERE status = 'pending' AND next_retry_at <= datetime('now')
      ORDER BY created_at ASC
      LIMIT 10
    `;
        try {
            const stmt = this.memoryDb.prepare(query);
            const rows = stmt.all();
            for (const row of rows) {
                try {
                    const event = JSON.parse(row.event_data);
                    await this.processReplicationEvent(event);
                    // Marquer comme traité
                    const updateStmt = this.memoryDb.prepare(`UPDATE sync_queue SET status = 'completed', updated_at = datetime('now') WHERE id = ?`);
                    updateStmt.run([row.id]);
                }
                catch (error) {
                    console.error(`Erreur traitement événement ${row.id}:`, error);
                    // Gérer les retries
                    const newRetryCount = row.retry_count + 1;
                    if (newRetryCount >= row.max_retries) {
                        const updateStmt = this.memoryDb.prepare(`UPDATE sync_queue SET status = 'failed', updated_at = datetime('now') WHERE id = ?`);
                        updateStmt.run([row.id]);
                    }
                    else {
                        const nextRetry = new Date();
                        nextRetry.setMinutes(nextRetry.getMinutes() + Math.pow(2, newRetryCount)); // Backoff exponentiel
                        const updateStmt = this.memoryDb.prepare(`UPDATE sync_queue SET retry_count = ?, next_retry_at = ?, updated_at = datetime('now') WHERE id = ?`);
                        updateStmt.run([newRetryCount, nextRetry.toISOString(), row.id]);
                    }
                }
            }
        }
        catch (error) {
            console.error('Erreur récupération sync queue:', error);
        }
    }
    async processReplicationEvent(event) {
        switch (event.syncType) {
            case 'critical_schema_sync':
                await this.syncCriticalSchemas(event);
                break;
            case 'hybrid_indexing':
                await this.syncHybridIndexing(event);
                break;
            default:
                console.warn(`Type de sync non géré: ${event.syncType}`);
        }
    }
    async syncCriticalSchemas(event) {
        if (event.tableName !== 'mcp_tools_schemas')
            return;
        const collectionName = 'mcp_schemas';
        switch (event.action) {
            case 'INSERT':
            case 'UPDATE':
                // Réindexer le document dans Zvec
                const docContent = event.newData?.schema_data || '';
                await this.indexDocumentInZvec(collectionName, event.recordId.toString(), docContent);
                break;
            case 'DELETE':
                // Supprimer de Zvec
                await this.deleteDocumentFromZvec(collectionName, event.recordId.toString());
                break;
        }
    }
    async syncHybridIndexing(event) {
        // Logique pour synchroniser avec l'indexation hybride
        switch (event.tableName) {
            case 'entities':
                await this.syncEntityChange(event);
                break;
            case 'observations':
                await this.syncObservationChange(event);
                break;
        }
    }
    async syncEntityChange(event) {
        const entityId = event.recordId.toString();
        // Qdrant exige un UInt ou un UUID valide. On génère un UUID déterministe.
        const uuidId = this.generateUuidFromId(entityId);
        if (event.action === 'DELETE') {
            // Supprimer l'entité de l'index hybride
            await this.deleteDocumentFromZvec('hybrid_search', `hybrid_${entityId}`);
            if (this.qdrantBridge) {
                try {
                    await this.qdrantBridge.deleteDocuments(this.qdrantCollection, [uuidId]);
                }
                catch (error) {
                    console.error('[QdrantBridge] Erreur delete:', error);
                }
            }
            return;
        }
        // Pour INSERT/UPDATE, récupérer les données complètes et réindexer
        if (!this.memoryDb)
            return;
        try {
            // Récupérer l'entité et ses observations
            const entityStmt = this.memoryDb.prepare(`SELECT * FROM entities WHERE id = ?`);
            const entity = entityStmt.get([entityId]);
            if (!entity)
                return;
            const observationsStmt = this.memoryDb.prepare(`SELECT content FROM observations WHERE entity_id = ?`);
            const observations = observationsStmt.all([entityId]);
            // Construire le contenu pour l'indexation
            let textContent = entity.name;
            if (observations.length > 0) {
                textContent += ' ' + observations.map(o => o.content).join(' ');
            }
            // Générer l'embedding une seule fois
            const { embedding } = await this.embeddings.embed(textContent);
            // Indexer dans Zvec
            this.store.addDocuments('hybrid_search', [{
                    id: `hybrid_${entityId}`,
                    text: textContent,
                    vector: embedding,
                    metadata: {
                        entityType: entity.entityType,
                        entityName: entity.name,
                        observations: observations.map(o => o.content),
                        lastModified: new Date()
                    }
                }]);
            // Indexer dans Qdrant si activé
            if (this.qdrantBridge) {
                try {
                    // S'assurer que le vecteur est un tableau de nombres standards
                    const standardVector = Array.from(embedding);
                    await this.qdrantBridge.upsertDocuments(this.qdrantCollection, [{
                            id: uuidId,
                            vector: standardVector,
                            payload: {
                                originalId: `hybrid_${entityId}`,
                                entityType: entity.entityType,
                                entityName: entity.name,
                                observations: observations.map((o) => o.content),
                                text: textContent,
                                lastModified: new Date().toISOString()
                            }
                        }]);
                }
                catch (error) {
                    console.error('[QdrantBridge] Erreur upsert:', error);
                }
            }
        }
        catch (error) {
            console.error('Erreur récupération données entité:', error);
        }
    }
    // Qdrant exige un entier non signé ou un UUID valide.
    // On génère un pseudo-UUID déterministe à partir de l'ID SQLite (ex: "00000000-0000-0000-0000-000000000042")
    generateUuidFromId(id) {
        const padded = id.padStart(12, '0');
        return `00000000-0000-0000-0000-${padded}`;
    }
    async syncObservationChange(event) {
        // Les changements d'observations déclenchent une réindexation de l'entité associée
        const entityId = event.newData?.entity_id || event.oldData?.entity_id;
        if (entityId) {
            await this.syncEntityChange({
                ...event,
                tableName: 'entities',
                recordId: entityId,
                action: 'UPDATE' // Forcer la réindexation
            });
        }
    }
    async indexDocumentInZvec(collectionName, docId, textContent, metadata) {
        // Générer l'embedding
        const { embedding } = await this.embeddings.embed(textContent);
        // Créer le document
        const doc = {
            id: docId,
            text: textContent,
            vector: embedding,
            metadata: metadata || {}
        };
        // Indexer dans Zvec
        this.store.addDocuments(collectionName, [doc]);
    }
    async deleteDocumentFromZvec(collectionName, docId) {
        this.store.deleteDocuments(collectionName, [docId]);
    }
    // Réconciliation périodique pour cohérence
    async reconcileCollections() {
        console.error('Démarrage réconciliation périodique...');
        // Vérifier cohérence mcp_schemas
        await this.reconcileMcpSchemas();
        // Vérifier cohérence hybrid_search
        await this.reconcileHybridIndex();
        console.error('Réconciliation terminée');
    }
    async reconcileMcpSchemas() {
        if (!this.memoryDb)
            return;
        try {
            // Comparer le nombre de documents dans Memory vs Zvec
            const countStmt = this.memoryDb.prepare(`SELECT COUNT(*) as count FROM mcp_tools_schemas`);
            const memoryResult = countStmt.get();
            const memoryCount = memoryResult.count;
            const zvecInfo = this.store.getCollectionInfo('mcp_schemas');
            if (zvecInfo.documentCount !== memoryCount) {
                console.warn(`Incohérence détectée - Memory: ${memoryCount}, Zvec: ${zvecInfo.documentCount}`);
                // TODO: Implémenter resynchronisation complète si nécessaire
            }
        }
        catch (error) {
            console.error('Erreur réconciliation MCP schemas:', error);
        }
    }
    async reconcileHybridIndex() {
        if (!this.memoryDb)
            return;
        try {
            // Vérifier cohérence des entités indexées
            const countStmt = this.memoryDb.prepare(`SELECT COUNT(*) as count FROM entities`);
            const entityResult = countStmt.get();
            const entityCount = entityResult.count;
            const zvecInfo = this.store.getCollectionInfo('hybrid_search');
            // Note: hybrid_search peut avoir moins de documents que entities
            // car seules certaines entités sont indexées hybride
            console.error(`Vérification cohérence - Entities: ${entityCount}, Hybrid docs: ${zvecInfo.documentCount}`);
        }
        catch (error) {
            console.error('Erreur réconciliation hybrid index:', error);
        }
    }
    // Méthode pour arrêter proprement
    async shutdown() {
        if (this.memoryDb) {
            this.memoryDb.close();
            console.error('Memory DB déconnectée');
        }
    }
}
export { PartialReplicationManager };
//# sourceMappingURL=partial-replication.js.map