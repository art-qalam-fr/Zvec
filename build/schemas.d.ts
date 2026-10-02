import { z } from "zod";
export declare const CreateCollectionSchema: z.ZodObject<{
    name: z.ZodString;
    distance: z.ZodDefault<z.ZodOptional<z.ZodEnum<["Cosine", "Euclid", "Dot"]>>>;
    enableHybrid: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
}, "strip", z.ZodTypeAny, {
    name: string;
    distance: "Cosine" | "Euclid" | "Dot";
    enableHybrid: boolean;
}, {
    name: string;
    distance?: "Cosine" | "Euclid" | "Dot" | undefined;
    enableHybrid?: boolean | undefined;
}>;
export declare const DeleteCollectionSchema: z.ZodObject<{
    name: z.ZodString;
}, "strip", z.ZodTypeAny, {
    name: string;
}, {
    name: string;
}>;
export declare const GetCollectionInfoSchema: z.ZodObject<{
    name: z.ZodString;
}, "strip", z.ZodTypeAny, {
    name: string;
}, {
    name: string;
}>;
export declare const DocumentSchema: z.ZodObject<{
    id: z.ZodString;
    text: z.ZodString;
    metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, "strip", z.ZodTypeAny, {
    id: string;
    text: string;
    metadata?: Record<string, unknown> | undefined;
}, {
    id: string;
    text: string;
    metadata?: Record<string, unknown> | undefined;
}>;
export declare const HybridDocumentSchema: z.ZodObject<{
    id: z.ZodString;
    text: z.ZodString;
    metadata: z.ZodOptional<z.ZodObject<{
        entityType: z.ZodOptional<z.ZodString>;
        entityName: z.ZodOptional<z.ZodString>;
        relations: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        observations: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        tags: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        lastModified: z.ZodOptional<z.ZodString>;
        source: z.ZodOptional<z.ZodEnum<["memory", "zvec"]>>;
    }, "strip", z.ZodTypeAny, {
        entityType?: string | undefined;
        entityName?: string | undefined;
        relations?: string[] | undefined;
        observations?: string[] | undefined;
        tags?: string[] | undefined;
        lastModified?: string | undefined;
        source?: "memory" | "zvec" | undefined;
    }, {
        entityType?: string | undefined;
        entityName?: string | undefined;
        relations?: string[] | undefined;
        observations?: string[] | undefined;
        tags?: string[] | undefined;
        lastModified?: string | undefined;
        source?: "memory" | "zvec" | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    id: string;
    text: string;
    metadata?: {
        entityType?: string | undefined;
        entityName?: string | undefined;
        relations?: string[] | undefined;
        observations?: string[] | undefined;
        tags?: string[] | undefined;
        lastModified?: string | undefined;
        source?: "memory" | "zvec" | undefined;
    } | undefined;
}, {
    id: string;
    text: string;
    metadata?: {
        entityType?: string | undefined;
        entityName?: string | undefined;
        relations?: string[] | undefined;
        observations?: string[] | undefined;
        tags?: string[] | undefined;
        lastModified?: string | undefined;
        source?: "memory" | "zvec" | undefined;
    } | undefined;
}>;
export declare const AddDocumentsSchema: z.ZodObject<{
    collection: z.ZodString;
    documents: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        text: z.ZodString;
        metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    }, "strip", z.ZodTypeAny, {
        id: string;
        text: string;
        metadata?: Record<string, unknown> | undefined;
    }, {
        id: string;
        text: string;
        metadata?: Record<string, unknown> | undefined;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    collection: string;
    documents: {
        id: string;
        text: string;
        metadata?: Record<string, unknown> | undefined;
    }[];
}, {
    collection: string;
    documents: {
        id: string;
        text: string;
        metadata?: Record<string, unknown> | undefined;
    }[];
}>;
export declare const DeleteDocumentsSchema: z.ZodObject<{
    collection: z.ZodString;
    ids: z.ZodArray<z.ZodString, "many">;
}, "strip", z.ZodTypeAny, {
    collection: string;
    ids: string[];
}, {
    collection: string;
    ids: string[];
}>;
export declare const SemanticSearchSchema: z.ZodObject<{
    collection: z.ZodString;
    query: z.ZodString;
    limit: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
    filter: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, "strip", z.ZodTypeAny, {
    collection: string;
    query: string;
    limit: number;
    filter?: Record<string, unknown> | undefined;
}, {
    collection: string;
    query: string;
    filter?: Record<string, unknown> | undefined;
    limit?: number | undefined;
}>;
export declare const HybridSearchSchema: z.ZodObject<{
    collection: z.ZodString;
    query: z.ZodString;
    limit: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
    filter: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, "strip", z.ZodTypeAny, {
    collection: string;
    query: string;
    limit: number;
    filter?: Record<string, unknown> | undefined;
}, {
    collection: string;
    query: string;
    filter?: Record<string, unknown> | undefined;
    limit?: number | undefined;
}>;
export declare const IndexCodebaseSchema: z.ZodObject<{
    path: z.ZodString;
    forceReindex: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
    extensions: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    ignorePatterns: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    path: string;
    forceReindex: boolean;
    extensions?: string[] | undefined;
    ignorePatterns?: string[] | undefined;
}, {
    path: string;
    forceReindex?: boolean | undefined;
    extensions?: string[] | undefined;
    ignorePatterns?: string[] | undefined;
}>;
export declare const SearchCodeSchema: z.ZodObject<{
    path: z.ZodString;
    query: z.ZodString;
    limit: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
    fileTypes: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    pathPattern: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    path: string;
    query: string;
    limit: number;
    fileTypes?: string[] | undefined;
    pathPattern?: string | undefined;
}, {
    path: string;
    query: string;
    limit?: number | undefined;
    fileTypes?: string[] | undefined;
    pathPattern?: string | undefined;
}>;
export declare const ReindexChangesSchema: z.ZodObject<{
    path: z.ZodString;
}, "strip", z.ZodTypeAny, {
    path: string;
}, {
    path: string;
}>;
export declare const GetIndexStatusSchema: z.ZodObject<{
    path: z.ZodString;
}, "strip", z.ZodTypeAny, {
    path: string;
}, {
    path: string;
}>;
export declare const ClearIndexSchema: z.ZodObject<{
    path: z.ZodString;
}, "strip", z.ZodTypeAny, {
    path: string;
}, {
    path: string;
}>;
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
    files: Record<string, {
        hash: string;
        lastModified: number;
        chunkCount: number;
    }>;
    lastIndexed: string;
    totalChunks: number;
    totalFiles: number;
}
//# sourceMappingURL=schemas.d.ts.map