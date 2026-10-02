import Database from "better-sqlite3";
import hnswlib from "hnswlib-node";
const { HierarchicalNSW } = hnswlib;
import { existsSync, mkdirSync, rmSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
// ===================================================================
// HNSW Vector Store (Option A)
//
// Alternative backend using:
//   - better-sqlite3 for document metadata/text storage (fast, queryable)
//   - hnswlib-node for HNSW approximate nearest neighbor search
//
// Advantages over brute-force:
//   - O(log n) search instead of O(n)
//   - Sub-millisecond search even at 500K+ vectors
//   - Persistent SQLite storage for metadata
//
// Enable via: ZVEC_BACKEND=hnsw (default: brute-force)
//
// Storage layout:
//   ZVEC_DATA_DIR/
//   ├── collection_name/
//   │   ├── metadata.db      (SQLite: config + documents)
//   │   ├── vectors.hnsw     (HNSW index file)
//   │   └── index_state.json (optional, for code indexing)
// ===================================================================
const DATA_DIR = process.env.ZVEC_DATA_DIR || "./zvec-data";
if (!existsSync(DATA_DIR))
    mkdirSync(DATA_DIR, { recursive: true });
// HNSW parameters
const HNSW_M = 16; // Max connections per layer
const HNSW_EF_CONSTRUCTION = 200; // Search width during construction
const HNSW_EF_SEARCH = 50; // Search width during queries
// In-memory cache for loaded collections
const cache = new Map();
// === Paths ===
function collDir(name) { return join(DATA_DIR, name); }
function dbPath(name) { return join(collDir(name), "metadata.db"); }
function hnswPath(name) { return join(collDir(name), "vectors.hnsw"); }
// === Distance mapping ===
function toHnswSpace(distance) {
    switch (distance) {
        case "Cosine": return "cosine";
        case "Euclid": return "l2";
        case "Dot": return "ip";
        default: return "cosine";
    }
}
// === BM25 for hybrid search ===
function tokenize(text) {
    return text.toLowerCase().replace(/[^\w\s]/g, " ").split(/\s+/).filter(t => t.length > 1);
}
function bm25Score(query, document) {
    const queryTokens = tokenize(query);
    const docTokens = tokenize(document);
    if (!queryTokens.length || !docTokens.length)
        return 0;
    const k1 = 1.5, b = 0.75, avgDl = 200;
    const tf = new Map();
    for (const t of docTokens)
        tf.set(t, (tf.get(t) || 0) + 1);
    let score = 0;
    for (const qt of queryTokens) {
        const freq = tf.get(qt) || 0;
        if (freq === 0)
            continue;
        score += (freq * (k1 + 1)) / (freq + k1 * (1 - b + b * docTokens.length / avgDl));
    }
    return score;
}
// === Load / Initialize collection ===
function loadCollection(name) {
    const cached = cache.get(name);
    if (cached)
        return cached;
    if (!existsSync(dbPath(name))) {
        throw new Error(`Collection "${name}" does not exist.`);
    }
    // Open SQLite DB
    const db = new Database(dbPath(name));
    db.pragma("journal_mode = WAL");
    // Read config
    const row = db.prepare("SELECT * FROM config LIMIT 1").get();
    const config = {
        name: row.name,
        dimensions: row.dimensions,
        distance: row.distance,
        enableHybrid: row.enableHybrid === 1,
        createdAt: row.createdAt,
        documentCount: row.documentCount,
    };
    // Load HNSW index
    const index = new HierarchicalNSW(toHnswSpace(config.distance), config.dimensions);
    if (existsSync(hnswPath(name))) {
        index.readIndexSync(hnswPath(name));
    }
    else {
        index.initIndex(1000, HNSW_M, HNSW_EF_CONSTRUCTION);
    }
    index.setEf(HNSW_EF_SEARCH);
    // Build label mappings
    const labelToId = new Map();
    const idToLabel = new Map();
    let maxLabel = 0;
    const docs = db.prepare("SELECT doc_id, label FROM documents").all();
    for (const d of docs) {
        labelToId.set(d.label, d.doc_id);
        idToLabel.set(d.doc_id, d.label);
        if (d.label >= maxLabel)
            maxLabel = d.label + 1;
    }
    const entry = { db, index, config, labelToId, idToLabel, nextLabel: maxLabel };
    cache.set(name, entry);
    return entry;
}
// ===================================================================
// HnswVectorStore — Public API (same interface as VectorStore)
// ===================================================================
export class HnswVectorStore {
    // --- Collection Management ---
    createCollection(name, dimensions, distance = "Cosine", enableHybrid = false) {
        if (existsSync(dbPath(name))) {
            throw new Error(`Collection "${name}" already exists.`);
        }
        const dir = collDir(name);
        if (!existsSync(dir))
            mkdirSync(dir, { recursive: true });
        // Create SQLite database
        const db = new Database(dbPath(name));
        db.pragma("journal_mode = WAL");
        db.exec(`
      CREATE TABLE config (
        name TEXT NOT NULL,
        dimensions INTEGER NOT NULL,
        distance TEXT NOT NULL,
        enableHybrid INTEGER NOT NULL,
        createdAt TEXT NOT NULL,
        documentCount INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE documents (
        doc_id TEXT PRIMARY KEY,
        label INTEGER UNIQUE NOT NULL,
        text TEXT NOT NULL,
        metadata TEXT
      );
      CREATE INDEX idx_label ON documents(label);
    `);
        db.prepare(`INSERT INTO config VALUES (?, ?, ?, ?, ?, 0)`).run(name, dimensions, distance, enableHybrid ? 1 : 0, new Date().toISOString());
        // Initialize HNSW index
        const index = new HierarchicalNSW(toHnswSpace(distance), dimensions);
        index.initIndex(1000, HNSW_M, HNSW_EF_CONSTRUCTION);
        index.setEf(HNSW_EF_SEARCH);
        index.writeIndexSync(hnswPath(name));
        const config = {
            name, dimensions, distance, enableHybrid,
            createdAt: new Date().toISOString(), documentCount: 0,
        };
        cache.set(name, {
            db, index, config,
            labelToId: new Map(), idToLabel: new Map(), nextLabel: 0,
        });
        db.close();
        cache.delete(name); // Will reload on next access
    }
    deleteCollection(name) {
        const cached = cache.get(name);
        if (cached) {
            cached.db.close();
            cache.delete(name);
        }
        const dir = collDir(name);
        if (!existsSync(dir))
            throw new Error(`Collection "${name}" does not exist.`);
        rmSync(dir, { recursive: true, force: true });
    }
    collectionExists(name) {
        return existsSync(dbPath(name));
    }
    listCollections() {
        if (!existsSync(DATA_DIR))
            return [];
        const collections = [];
        for (const entry of readdirSync(DATA_DIR, { withFileTypes: true })) {
            if (entry.isDirectory() && existsSync(dbPath(entry.name))) {
                try {
                    const { config } = loadCollection(entry.name);
                    collections.push(config);
                }
                catch { /* skip corrupt */ }
            }
        }
        return collections;
    }
    getCollectionInfo(name) {
        const { config } = loadCollection(name);
        return { ...config, hybridEnabled: config.enableHybrid };
    }
    // --- Document Management ---
    addDocuments(collectionName, documents) {
        const coll = loadCollection(collectionName);
        // Resize HNSW index if needed
        const currentMaxElements = coll.index.getMaxElements();
        const needed = coll.nextLabel + documents.length;
        if (needed > currentMaxElements) {
            coll.index.resizeIndex(Math.max(needed * 2, currentMaxElements * 2));
        }
        const insertDoc = coll.db.prepare(`INSERT OR REPLACE INTO documents (doc_id, label, text, metadata) VALUES (?, ?, ?, ?)`);
        const insertMany = coll.db.transaction(() => {
            for (const doc of documents) {
                if (doc.vector.length !== coll.config.dimensions) {
                    throw new Error(`Vector dimension mismatch for "${doc.id}": expected ${coll.config.dimensions}, got ${doc.vector.length}`);
                }
                // Remove existing if updating
                const existingLabel = coll.idToLabel.get(doc.id);
                if (existingLabel !== undefined) {
                    coll.index.markDelete(existingLabel);
                    coll.labelToId.delete(existingLabel);
                }
                const label = coll.nextLabel++;
                coll.index.addPoint(doc.vector, label);
                coll.labelToId.set(label, doc.id);
                coll.idToLabel.set(doc.id, label);
                insertDoc.run(doc.id, label, doc.text, doc.metadata ? JSON.stringify(doc.metadata) : null);
            }
        });
        insertMany();
        // Update config
        const count = coll.db.prepare("SELECT COUNT(*) as c FROM documents").get().c;
        coll.db.prepare("UPDATE config SET documentCount = ?").run(count);
        coll.config.documentCount = count;
        // Persist HNSW index
        coll.index.writeIndexSync(hnswPath(collectionName));
    }
    deleteDocuments(collectionName, ids) {
        const coll = loadCollection(collectionName);
        const delDoc = coll.db.prepare("DELETE FROM documents WHERE doc_id = ?");
        const delMany = coll.db.transaction(() => {
            for (const id of ids) {
                const label = coll.idToLabel.get(id);
                if (label !== undefined) {
                    coll.index.markDelete(label);
                    coll.labelToId.delete(label);
                    coll.idToLabel.delete(id);
                }
                delDoc.run(id);
            }
        });
        delMany();
        const count = coll.db.prepare("SELECT COUNT(*) as c FROM documents").get().c;
        coll.db.prepare("UPDATE config SET documentCount = ?").run(count);
        coll.config.documentCount = count;
        coll.index.writeIndexSync(hnswPath(collectionName));
    }
    // --- Search ---
    search(collectionName, queryVector, limit = 5, filter) {
        const coll = loadCollection(collectionName);
        if (coll.config.documentCount === 0)
            return [];
        // HNSW search (fetch more if filtering)
        const fetchK = filter && Object.keys(filter).length > 0 ? limit * 5 : limit;
        const { neighbors, distances } = coll.index.searchKnn(queryVector, Math.min(fetchK, coll.config.documentCount));
        const results = [];
        const getDoc = coll.db.prepare("SELECT doc_id, text, metadata FROM documents WHERE label = ?");
        for (let i = 0; i < neighbors.length && results.length < limit; i++) {
            const label = neighbors[i];
            const docId = coll.labelToId.get(label);
            if (!docId)
                continue;
            const row = getDoc.get(label);
            if (!row)
                continue;
            const metadata = row.metadata ? JSON.parse(row.metadata) : undefined;
            // Apply filter
            if (filter && Object.keys(filter).length > 0) {
                if (!metadata)
                    continue;
                let match = true;
                for (const [k, v] of Object.entries(filter)) {
                    if (metadata[k] !== v) {
                        match = false;
                        break;
                    }
                }
                if (!match)
                    continue;
            }
            // Convert distance to similarity score
            const dist = distances[i];
            let score;
            switch (coll.config.distance) {
                case "Cosine":
                    score = 1 - dist;
                    break;
                case "Euclid":
                    score = 1 / (1 + dist);
                    break;
                case "Dot":
                    score = -dist;
                    break; // hnswlib negates for maxheap
                default: score = 1 - dist;
            }
            results.push({
                id: row.doc_id,
                score: Math.round(score * 10000) / 10000,
                text: row.text,
                metadata,
            });
        }
        return results;
    }
    hybridSearch(collectionName, queryVector, queryText, limit = 5, filter) {
        const coll = loadCollection(collectionName);
        if (coll.config.documentCount === 0)
            return [];
        // Get more candidates for hybrid ranking
        const fetchK = Math.min(limit * 5, coll.config.documentCount);
        const { neighbors, distances } = coll.index.searchKnn(queryVector, fetchK);
        const DENSE_WEIGHT = 0.7;
        const SPARSE_WEIGHT = 0.3;
        const candidates = [];
        const getDoc = coll.db.prepare("SELECT doc_id, text, metadata FROM documents WHERE label = ?");
        for (let i = 0; i < neighbors.length; i++) {
            const label = neighbors[i];
            const row = getDoc.get(label);
            if (!row)
                continue;
            const metadata = row.metadata ? JSON.parse(row.metadata) : undefined;
            // Filter
            if (filter && Object.keys(filter).length > 0) {
                if (!metadata)
                    continue;
                let match = true;
                for (const [k, v] of Object.entries(filter)) {
                    if (metadata[k] !== v) {
                        match = false;
                        break;
                    }
                }
                if (!match)
                    continue;
            }
            const dist = distances[i];
            let denseScore;
            switch (coll.config.distance) {
                case "Cosine":
                    denseScore = 1 - dist;
                    break;
                case "Euclid":
                    denseScore = 1 / (1 + dist);
                    break;
                case "Dot":
                    denseScore = -dist;
                    break;
                default: denseScore = 1 - dist;
            }
            const sparseScore = Math.min(bm25Score(queryText, row.text) / 5, 1);
            const combined = DENSE_WEIGHT * denseScore + SPARSE_WEIGHT * sparseScore;
            candidates.push({
                id: row.doc_id,
                score: Math.round(combined * 10000) / 10000,
                text: row.text,
                metadata,
            });
        }
        candidates.sort((a, b) => b.score - a.score);
        return candidates.slice(0, limit);
    }
    // --- Indexing State ---
    saveIndexState(collectionName, state) {
        const dir = collDir(collectionName);
        if (!existsSync(dir))
            mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, "index_state.json"), JSON.stringify(state, null, 2), "utf-8");
    }
    loadIndexState(collectionName) {
        const p = join(collDir(collectionName), "index_state.json");
        if (!existsSync(p))
            return null;
        return JSON.parse(readFileSync(p, "utf-8"));
    }
    clearIndexState(collectionName) {
        const p = join(collDir(collectionName), "index_state.json");
        if (existsSync(p))
            rmSync(p);
    }
    getDocumentCount(collectionName) {
        const { config } = loadCollection(collectionName);
        return config.documentCount;
    }
    invalidateCache(collectionName) {
        if (collectionName) {
            const cached = cache.get(collectionName);
            if (cached)
                cached.db.close();
            cache.delete(collectionName);
        }
        else {
            for (const [, v] of cache)
                v.db.close();
            cache.clear();
        }
    }
}
//# sourceMappingURL=hnsw-store.js.map