import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, extname, resolve } from "node:path";
import { createHash } from "node:crypto";
import ignore, { type Ignore } from "ignore";
import type { IndexingState } from "./schemas.js";
import type { VectorStore } from "./vector-store.js";
import type { HnswVectorStore } from "./hnsw-store.js";
import { EmbeddingProvider } from "./embeddings.js";

// ===================================================================
// Code Indexer
//
// Indexes codebases for semantic search. Supports:
// - File discovery with .gitignore support
// - Smart text chunking with overlap
// - Incremental re-indexing (detect changed files)
// - File type filtering and path patterns
// ===================================================================

// Default settings
const DEFAULT_CHUNK_SIZE = 1500;
const DEFAULT_CHUNK_OVERLAP = 200;
const DEFAULT_BATCH_SIZE = 10;
const DEFAULT_SEARCH_LIMIT = 5;

const DEFAULT_CODE_EXTENSIONS = new Set([
    ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
    ".py", ".pyw",
    ".go",
    ".rs",
    ".java", ".kt", ".kts",
    ".c", ".cpp", ".h", ".hpp", ".cc",
    ".cs",
    ".rb",
    ".php",
    ".swift",
    ".scala",
    ".lua",
    ".r", ".R",
    ".sql",
    ".sh", ".bash", ".zsh",
    ".yaml", ".yml",
    ".json",
    ".toml",
    ".xml",
    ".html", ".css", ".scss",
    ".md", ".mdx",
    ".vue", ".svelte",
    ".dockerfile",
    ".tf", ".hcl",
    ".prisma", ".graphql", ".proto",
]);

const DEFAULT_IGNORE_PATTERNS = [
    "node_modules", ".git", ".svn", ".hg",
    "__pycache__", ".pyc",
    "dist", "build", "out", ".next",
    "coverage", ".nyc_output",
    ".vscode", ".idea", ".vs",
    "*.min.js", "*.min.css",
    "*.map",
    "package-lock.json", "yarn.lock", "pnpm-lock.yaml",
    ".env", ".env.*",
    "*.log",
];

// Sanitize codebase path to create a valid collection name
function pathToCollectionName(path: string): string {
    const normalized = resolve(path)
        .replace(/[\\/:]/g, "_")
        .replace(/^_+|_+$/g, "")
        .toLowerCase();
    return `code_${normalized}`.substring(0, 100);
}

// Create file hash for change detection
function fileHash(filePath: string): string {
    const content = readFileSync(filePath, "utf-8");
    return createHash("md5").update(content).digest("hex");
}

// Build ignore filter from .gitignore + default patterns
function buildIgnoreFilter(rootPath: string, extraPatterns?: string[]): Ignore {
    const ig = ignore();

    // Add default ignore patterns
    ig.add(DEFAULT_IGNORE_PATTERNS);

    // Add .gitignore patterns
    const gitignorePath = join(rootPath, ".gitignore");
    if (existsSync(gitignorePath)) {
        const gitignore = readFileSync(gitignorePath, "utf-8");
        ig.add(gitignore);
    }

    // Add extra patterns
    if (extraPatterns) {
        ig.add(extraPatterns);
    }

    return ig;
}

// Discover files recursively
function discoverFiles(
    rootPath: string,
    ig: Ignore,
    extensions?: Set<string>
): string[] {
    const files: string[] = [];
    const validExtensions = extensions || DEFAULT_CODE_EXTENSIONS;

    function walk(dir: string): void {
        let entries;
        try {
            entries = readdirSync(dir, { withFileTypes: true });
        } catch {
            return;
        }

        for (const entry of entries) {
            const fullPath = join(dir, entry.name);
            const relPath = relative(rootPath, fullPath);

            // Check if ignored
            if (ig.ignores(relPath)) continue;

            if (entry.isDirectory()) {
                walk(fullPath);
            } else if (entry.isFile()) {
                const ext = extname(entry.name).toLowerCase();
                if (validExtensions.has(ext)) {
                    // Skip files that are too large (> 1MB)
                    try {
                        const stat = statSync(fullPath);
                        if (stat.size <= 1024 * 1024) {
                            files.push(fullPath);
                        }
                    } catch {
                        // Skip inaccessible files
                    }
                }
            }
        }
    }

    walk(rootPath);
    return files;
}

// Split file content into chunks with overlap
function chunkText(
    text: string,
    chunkSize: number = DEFAULT_CHUNK_SIZE,
    chunkOverlap: number = DEFAULT_CHUNK_OVERLAP
): string[] {
    if (text.length <= chunkSize) {
        return [text];
    }

    const chunks: string[] = [];
    let start = 0;

    while (start < text.length) {
        let end = start + chunkSize;

        // Try to break at a newline boundary
        if (end < text.length) {
            const lastNewline = text.lastIndexOf("\n", end);
            if (lastNewline > start + chunkSize / 2) {
                end = lastNewline + 1;
            }
        }

        chunks.push(text.substring(start, Math.min(end, text.length)));
        start = end - chunkOverlap;

        if (start >= text.length) break;
    }

    return chunks;
}

// ===================================================================
// CodeIndexer class
// ===================================================================

export class CodeIndexer {
    private store: VectorStore | HnswVectorStore;
    private embeddings: EmbeddingProvider;

    constructor(store: VectorStore | HnswVectorStore, embeddings: EmbeddingProvider) {
        this.store = store;
        this.embeddings = embeddings;
    }

    // Get collection name for a codebase path
    getCollectionName(path: string): string {
        return pathToCollectionName(path);
    }

    // Full index of a codebase
    async indexCodebase(
        rootPath: string,
        options: {
            forceReindex?: boolean;
            extensions?: string[];
            ignorePatterns?: string[];
        } = {}
    ): Promise<{ totalFiles: number; totalChunks: number; collectionName: string }> {
        const absPath = resolve(rootPath);
        const collectionName = this.getCollectionName(absPath);

        // Check if already indexed
        if (!options.forceReindex && this.store.collectionExists(collectionName)) {
            const state = this.store.loadIndexState(collectionName) as IndexingState | null;
            if (state) {
                return {
                    totalFiles: state.totalFiles,
                    totalChunks: state.totalChunks,
                    collectionName,
                };
            }
        }

        // Delete existing collection if force reindex
        if (this.store.collectionExists(collectionName)) {
            this.store.deleteCollection(collectionName);
        }

        // Create collection
        const dimensions = this.embeddings.getDimensions();
        this.store.createCollection(collectionName, dimensions, "Cosine", true);

        // Discover files
        const customExtensions = options.extensions
            ? new Set(options.extensions)
            : undefined;
        const ig = buildIgnoreFilter(absPath, options.ignorePatterns);
        const files = discoverFiles(absPath, ig, customExtensions);

        let totalChunks = 0;
        const fileStates: IndexingState["files"] = {};

        // Process files in batches
        for (let i = 0; i < files.length; i += DEFAULT_BATCH_SIZE) {
            const batch = files.slice(i, i + DEFAULT_BATCH_SIZE);
            const allChunks: Array<{ id: string; text: string; metadata: Record<string, unknown> }> = [];

            for (const filePath of batch) {
                try {
                    const content = readFileSync(filePath, "utf-8");
                    const relPath = relative(absPath, filePath);
                    const chunks = chunkText(content);
                    const hash = fileHash(filePath);
                    const stat = statSync(filePath);

                    fileStates[relPath] = {
                        hash,
                        lastModified: stat.mtimeMs,
                        chunkCount: chunks.length,
                    };

                    for (let ci = 0; ci < chunks.length; ci++) {
                        const chunkId = `${relPath}:chunk_${ci}`;
                        allChunks.push({
                            id: chunkId,
                            text: chunks[ci],
                            metadata: {
                                file: relPath,
                                filePath: filePath,
                                chunkIndex: ci,
                                totalChunks: chunks.length,
                                language: extname(filePath).substring(1),
                            },
                        });
                    }
                } catch {
                    // Skip unreadable files
                }
            }

            if (allChunks.length > 0) {
                // Generate embeddings
                const texts = allChunks.map((c) => c.text);
                const embeddingResults = await this.embeddings.embedBatch(texts);

                // Store documents
                const docs = allChunks.map((chunk, idx) => ({
                    id: chunk.id,
                    text: chunk.text,
                    vector: embeddingResults[idx].embedding,
                    metadata: chunk.metadata,
                }));

                this.store.addDocuments(collectionName, docs);
                totalChunks += allChunks.length;
            }
        }

        // Save indexing state
        const state: IndexingState = {
            collectionName,
            rootPath: absPath,
            files: fileStates,
            lastIndexed: new Date().toISOString(),
            totalChunks,
            totalFiles: files.length,
        };
        this.store.saveIndexState(collectionName, state as unknown as Record<string, unknown>);

        return { totalFiles: files.length, totalChunks, collectionName };
    }

    // Search indexed codebase
    async searchCode(
        rootPath: string,
        query: string,
        options: {
            limit?: number;
            fileTypes?: string[];
            pathPattern?: string;
        } = {}
    ): Promise<Array<{ file: string; text: string; score: number; chunkIndex: number }>> {
        const absPath = resolve(rootPath);
        const collectionName = this.getCollectionName(absPath);

        if (!this.store.collectionExists(collectionName)) {
            throw new Error(`Codebase at "${rootPath}" has not been indexed. Run index_codebase first.`);
        }

        // Generate query embedding
        const { embedding } = await this.embeddings.embed(query);

        // Build filter for file types
        let filter: Record<string, unknown> | undefined;
        if (options.fileTypes && options.fileTypes.length > 0) {
            // We'll filter results after search since our filter is simple key-match
        }

        // Search
        const limit = options.limit || DEFAULT_SEARCH_LIMIT;
        const results = this.store.hybridSearch(
            collectionName,
            embedding,
            query,
            limit * 3, // Over-fetch for post-filtering
            filter
        );

        // Post-filter by file type and path pattern
        let filtered = results;

        if (options.fileTypes && options.fileTypes.length > 0) {
            const exts = new Set(options.fileTypes);
            filtered = filtered.filter((r) => {
                const lang = r.metadata?.language as string;
                return lang && exts.has(`.${lang}`);
            });
        }

        if (options.pathPattern) {
            const pattern = options.pathPattern;
            filtered = filtered.filter((r) => {
                const file = r.metadata?.file as string;
                return file && this.matchGlob(file, pattern);
            });
        }

        return filtered.slice(0, limit).map((r) => ({
            file: (r.metadata?.file as string) || "unknown",
            text: r.text,
            score: r.score,
            chunkIndex: (r.metadata?.chunkIndex as number) || 0,
        }));
    }

    // Incrementally re-index changed files
    async reindexChanges(rootPath: string): Promise<{
        added: number;
        modified: number;
        deleted: number;
        totalChunks: number;
    }> {
        const absPath = resolve(rootPath);
        const collectionName = this.getCollectionName(absPath);

        if (!this.store.collectionExists(collectionName)) {
            throw new Error(`Codebase at "${rootPath}" has not been indexed. Run index_codebase first.`);
        }

        const state = this.store.loadIndexState(collectionName) as IndexingState | null;
        if (!state) {
            throw new Error(`No indexing state found. Run index_codebase first.`);
        }

        // Discover current files
        const ig = buildIgnoreFilter(absPath);
        const currentFiles = discoverFiles(absPath, ig);
        const currentFileMap = new Map(currentFiles.map((f) => [relative(absPath, f), f]));

        let added = 0;
        let modified = 0;
        let deleted = 0;

        // Find deleted files
        const deletedIds: string[] = [];
        for (const [relPath, fileInfo] of Object.entries(state.files)) {
            if (!currentFileMap.has(relPath)) {
                // File was deleted — remove its chunks
                for (let i = 0; i < fileInfo.chunkCount; i++) {
                    deletedIds.push(`${relPath}:chunk_${i}`);
                }
                delete state.files[relPath];
                deleted++;
            }
        }

        if (deletedIds.length > 0) {
            this.store.deleteDocuments(collectionName, deletedIds);
        }

        // Find added/modified files
        const filesToProcess: string[] = [];
        for (const [relPath, fullPath] of currentFileMap) {
            const existingState = state.files[relPath];
            if (!existingState) {
                filesToProcess.push(fullPath);
                added++;
            } else {
                const currentHash = fileHash(fullPath);
                if (currentHash !== existingState.hash) {
                    // Remove old chunks
                    const oldIds: string[] = [];
                    for (let i = 0; i < existingState.chunkCount; i++) {
                        oldIds.push(`${relPath}:chunk_${i}`);
                    }
                    this.store.deleteDocuments(collectionName, oldIds);
                    filesToProcess.push(fullPath);
                    modified++;
                }
            }
        }

        // Index new/modified files
        let newChunks = 0;
        for (let i = 0; i < filesToProcess.length; i += DEFAULT_BATCH_SIZE) {
            const batch = filesToProcess.slice(i, i + DEFAULT_BATCH_SIZE);
            const allChunks: Array<{ id: string; text: string; metadata: Record<string, unknown> }> = [];

            for (const filePath of batch) {
                try {
                    const content = readFileSync(filePath, "utf-8");
                    const relPath = relative(absPath, filePath);
                    const chunks = chunkText(content);
                    const hash = fileHash(filePath);
                    const stat = statSync(filePath);

                    state.files[relPath] = {
                        hash,
                        lastModified: stat.mtimeMs,
                        chunkCount: chunks.length,
                    };

                    for (let ci = 0; ci < chunks.length; ci++) {
                        allChunks.push({
                            id: `${relPath}:chunk_${ci}`,
                            text: chunks[ci],
                            metadata: {
                                file: relPath,
                                filePath,
                                chunkIndex: ci,
                                totalChunks: chunks.length,
                                language: extname(filePath).substring(1),
                            },
                        });
                    }
                } catch {
                    // Skip
                }
            }

            if (allChunks.length > 0) {
                const texts = allChunks.map((c) => c.text);
                const embeddingResults = await this.embeddings.embedBatch(texts);

                const docs = allChunks.map((chunk, idx) => ({
                    id: chunk.id,
                    text: chunk.text,
                    vector: embeddingResults[idx].embedding,
                    metadata: chunk.metadata,
                }));

                this.store.addDocuments(collectionName, docs);
                newChunks += allChunks.length;
            }
        }

        // Update state
        state.lastIndexed = new Date().toISOString();
        state.totalFiles = currentFileMap.size;
        state.totalChunks = Object.values(state.files).reduce((sum, f) => sum + f.chunkCount, 0);
        this.store.saveIndexState(collectionName, state as unknown as Record<string, unknown>);

        return { added, modified, deleted, totalChunks: state.totalChunks };
    }

    // Get indexing status
    getIndexStatus(rootPath: string): {
        indexed: boolean;
        collectionName: string;
        stats?: {
            totalFiles: number;
            totalChunks: number;
            lastIndexed: string;
        };
    } {
        const absPath = resolve(rootPath);
        const collectionName = this.getCollectionName(absPath);

        if (!this.store.collectionExists(collectionName)) {
            return { indexed: false, collectionName };
        }

        const state = this.store.loadIndexState(collectionName) as IndexingState | null;
        if (!state) {
            return { indexed: false, collectionName };
        }

        return {
            indexed: true,
            collectionName,
            stats: {
                totalFiles: state.totalFiles,
                totalChunks: state.totalChunks,
                lastIndexed: state.lastIndexed,
            },
        };
    }

    // Clear index for a codebase
    clearIndex(rootPath: string): void {
        const absPath = resolve(rootPath);
        const collectionName = this.getCollectionName(absPath);

        if (this.store.collectionExists(collectionName)) {
            this.store.deleteCollection(collectionName);
        }
    }

    // Simple glob matching
    private matchGlob(path: string, pattern: string): boolean {
        const regex = pattern
            .replace(/\./g, "\\.")
            .replace(/\*\*/g, "{{DOUBLE}}")
            .replace(/\*/g, "[^/]*")
            .replace(/{{DOUBLE}}/g, ".*");
        return new RegExp(`^${regex}$`).test(path);
    }
}
