import { z } from "zod";

// === Collection Schemas ===
export const CreateCollectionSchema = z.object({
    name: z.string().min(1),
    distance: z.enum(["Cosine", "Euclid", "Dot"]).optional().default("Cosine"),
    enableHybrid: z.boolean().optional().default(false),
});

export const DeleteCollectionSchema = z.object({
    name: z.string().min(1),
});

export const GetCollectionInfoSchema = z.object({
    name: z.string().min(1),
});

// === Document Schemas ===
export const DocumentSchema = z.object({
    id: z.string().min(1),
    text: z.string().min(1),
    metadata: z.record(z.unknown()).optional(),
});

export const HybridDocumentSchema = z.object({
    id: z.string().min(1),
    text: z.string().min(1),
    metadata: z.object({
        entityType: z.string().optional(),
        entityName: z.string().optional(),
        relations: z.array(z.string()).optional(),
        observations: z.array(z.string()).optional(),
        tags: z.array(z.string()).optional(),
        lastModified: z.string().optional(),
        source: z.enum(['memory', 'zvec']).optional(),
    }).optional(),
});

export const AddDocumentsSchema = z.object({
    collection: z.string().min(1),
    documents: z.array(DocumentSchema).min(1),
});

export const DeleteDocumentsSchema = z.object({
    collection: z.string().min(1),
    ids: z.array(z.string()).min(1),
});

// === Search Schemas ===
export const SemanticSearchSchema = z.object({
    collection: z.string().min(1),
    query: z.string().min(1),
    limit: z.number().min(1).max(100).optional().default(5),
    filter: z.record(z.unknown()).optional(),
});

export const HybridSearchSchema = z.object({
    collection: z.string().min(1),
    query: z.string().min(1),
    limit: z.number().min(1).max(100).optional().default(5),
    filter: z.record(z.unknown()).optional(),
});

// === Code Indexing Schemas ===
export const IndexCodebaseSchema = z.object({
    path: z.string().min(1),
    forceReindex: z.boolean().optional().default(false),
    extensions: z.array(z.string()).optional(),
    ignorePatterns: z.array(z.string()).optional(),
});

export const SearchCodeSchema = z.object({
    path: z.string().min(1),
    query: z.string().min(1),
    limit: z.number().min(1).max(100).optional().default(5),
    fileTypes: z.array(z.string()).optional(),
    pathPattern: z.string().optional(),
});

export const ReindexChangesSchema = z.object({
    path: z.string().min(1),
});

export const GetIndexStatusSchema = z.object({
    path: z.string().min(1),
});

export const ClearIndexSchema = z.object({
    path: z.string().min(1),
});

// === Types ===
export interface CollectionConfig {
    name: string;
    dimensions: number;
    distance: "Cosine" | "Euclid" | "Dot";
    enableHybrid: boolean;
    createdAt: string;
    documentCount: number;
}

export interface StoredDocument {
    id: string;
    text: string;
    vector: number[];
    metadata?: Record<string, unknown>;
}

export interface SearchResult {
    id: string;
    score: number;
    text: string;
    metadata?: Record<string, unknown>;
}

export interface IndexingState {
    collectionName: string;
    rootPath: string;
    files: Record<string, { hash: string; lastModified: number; chunkCount: number }>;
    lastIndexed: string;
    totalChunks: number;
    totalFiles: number;
}
