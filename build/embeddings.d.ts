export interface EmbeddingResult {
    embedding: number[];
    tokenCount: number;
}
export declare class EmbeddingProvider {
    private readonly provider;
    private readonly denseEmbedding;
    private readonly apiKey;
    private readonly baseUrl;
    private readonly remoteModel;
    private readonly remoteDimensions;
    constructor();
    getDimensions(): number;
    embed(text: string): Promise<EmbeddingResult>;
    embedBatch(texts: string[]): Promise<EmbeddingResult[]>;
}
//# sourceMappingURL=embeddings.d.ts.map