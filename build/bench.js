import { existsSync, mkdirSync } from "node:fs";
import { randomUUID, randomBytes } from "node:crypto";
import { performance } from "node:perf_hooks";
import { VectorStore } from "./vector-store.js";
import { HnswVectorStore } from "./hnsw-store.js";
const DOC_COUNT = parseInt(process.env.BENCH_DOCS ?? "100", 10);
const DIMENSIONS = parseInt(process.env.BENCH_DIMENSIONS ?? process.env.EMBEDDING_DIMENSIONS ?? "1536", 10);
const QUERY_COUNT = parseInt(process.env.BENCH_QUERIES ?? "20", 10);
const dataDir = process.env.ZVEC_DATA_DIR ?? "./zvec-data";
if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
}
const vocabulary = [
    "alpha", "bravo", "charlie", "delta", "echo", "foxtrot",
    "golf", "hotel", "india", "juliet", "kilo", "lima",
    "mike", "november", "oscar", "papa", "quebec", "romeo",
    "sierra", "tango", "uniform", "victor", "whiskey", "xray",
    "yankee", "zulu",
];
function randomText(index) {
    const words = [];
    for (let i = 0; i < 12; i++) {
        const idx = randomBytes(1)[0] % vocabulary.length;
        words.push(vocabulary[idx]);
    }
    return `Document ${index}: ${words.join(" ")}`;
}
function randomVector(dim) {
    const vec = new Array(dim);
    for (let i = 0; i < dim; i++) {
        vec[i] = Math.random();
    }
    return vec;
}
function cloneDocuments(docs) {
    return docs.map((doc) => ({
        id: doc.id,
        text: doc.text,
        vector: [...doc.vector],
        metadata: doc.metadata ? { ...doc.metadata } : undefined,
    }));
}
function warmupSearch(store, collection, queries) {
    let lastScore = 0;
    const t0 = performance.now();
    for (const q of queries) {
        const results = store.search(collection, q, 5);
        if (results.length > 0) {
            lastScore = results[0].score;
        }
    }
    const t1 = performance.now();
    return { duration: t1 - t0, lastScore };
}
function cleanCollection(store, name) {
    try {
        if ("invalidateCache" in store && typeof store.invalidateCache === "function") {
            store.invalidateCache(name);
        }
    }
    catch {
        // ignore cache errors
    }
    if (store.collectionExists(name)) {
        store.deleteCollection(name);
    }
    try {
        if ("invalidateCache" in store && typeof store.invalidateCache === "function") {
            store.invalidateCache(name);
        }
    }
    catch {
        // ignore
    }
}
function benchmarkStore(backendName, store, baseDocs, queryVectors) {
    const collectionName = `${backendName.toLowerCase()}_${randomUUID()}`.slice(0, 40);
    cleanCollection(store, collectionName);
    const createStart = performance.now();
    store.createCollection(collectionName, DIMENSIONS, "Cosine", true);
    const createEnd = performance.now();
    const addStart = performance.now();
    store.addDocuments(collectionName, cloneDocuments(baseDocs));
    const addEnd = performance.now();
    const { duration: searchDuration, lastScore } = warmupSearch(store, collectionName, queryVectors);
    cleanCollection(store, collectionName);
    return {
        backend: backendName,
        createTimeMs: createEnd - createStart,
        addTimeMs: addEnd - addStart,
        totalSearchTimeMs: searchDuration,
        avgSearchTimeMs: searchDuration / queryVectors.length,
        topScore: lastScore,
    };
}
function format(ms) {
    return ms.toFixed(2);
}
function formatScore(score) {
    return score.toFixed(4);
}
function main() {
    if (DOC_COUNT <= 0) {
        throw new Error("BENCH_DOCS doit être supérieur à 0");
    }
    if (DIMENSIONS <= 0) {
        throw new Error("DIMENSIONS doit être supérieur à 0");
    }
    if (QUERY_COUNT <= 0) {
        throw new Error("BENCH_QUERIES doit être supérieur à 0");
    }
    const documents = Array.from({ length: DOC_COUNT }, (_, idx) => ({
        id: `doc-${idx}`,
        text: randomText(idx),
        vector: randomVector(DIMENSIONS),
        metadata: { bucket: idx % 5 },
    }));
    const queryVectors = Array.from({ length: QUERY_COUNT }, (_, idx) => {
        if (idx < documents.length) {
            return [...documents[idx].vector];
        }
        return randomVector(DIMENSIONS);
    });
    const bruteStore = new VectorStore();
    const hnswStore = new HnswVectorStore();
    const bruteResult = benchmarkStore("Brute", bruteStore, documents, queryVectors);
    const hnswResult = benchmarkStore("HNSW", hnswStore, documents, queryVectors);
    const table = [
        {
            Backend: bruteResult.backend,
            "Création (ms)": format(bruteResult.createTimeMs),
            "Ajout docs (ms)": format(bruteResult.addTimeMs),
            "Recherche totale (ms)": format(bruteResult.totalSearchTimeMs),
            "Recherche / requête (ms)": format(bruteResult.avgSearchTimeMs),
            "Score top résultat": formatScore(bruteResult.topScore),
        },
        {
            Backend: hnswResult.backend,
            "Création (ms)": format(hnswResult.createTimeMs),
            "Ajout docs (ms)": format(hnswResult.addTimeMs),
            "Recherche totale (ms)": format(hnswResult.totalSearchTimeMs),
            "Recherche / requête (ms)": format(hnswResult.avgSearchTimeMs),
            "Score top résultat": formatScore(hnswResult.topScore),
        },
    ];
    console.error("\n=== Benchmark VectorStore vs HNSW ===");
    console.error(`Documents: ${DOC_COUNT} | Dimensions: ${DIMENSIONS} | Requêtes: ${QUERY_COUNT}`);
    console.table(table);
}
main();
//# sourceMappingURL=bench.js.map