export interface DenseEmbeddingFunction {
    readonly dimension: number;
    embed(text: string): Promise<number[]>;
    embedBatch(texts: string[]): Promise<number[][]>;
}
export interface SparseEmbeddingFunction {
    embed(text: string): Promise<Map<string, number>>;
    embedBatch(texts: string[]): Promise<Map<string, number>[]>;
}
export declare class DefaultLocalDenseEmbedding implements DenseEmbeddingFunction {
    readonly dimension: number;
    private readonly model;
    constructor(options?: {
        model?: string;
    });
    embed(text: string): Promise<number[]>;
    embedBatch(texts: string[]): Promise<number[][]>;
}
export declare class DefaultLocalSparseEmbedding implements SparseEmbeddingFunction {
    private stopWords;
    embed(text: string): Promise<Map<string, number>>;
    embedBatch(texts: string[]): Promise<Map<string, number>[]>;
    private computeWeights;
}
//# sourceMappingURL=embedding-functions.d.ts.map