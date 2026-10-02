import { VectorStore } from "./vector-store.js";
interface PerformanceMetrics {
    avgResponseTime: number;
    cacheHitRate: number;
    memoryUsage: number;
    errorRate: number;
    searchVolume: number;
}
interface HNSWConfig {
    M: number;
    EF: number;
    score: number;
}
interface TuningRecommendation {
    type: 'hnsw' | 'cache' | 'memory';
    action: string;
    expectedImprovement: number;
    confidence: number;
}
export declare class AutoTuner {
    private performanceHistory;
    private lastTuningTime;
    private tuningInterval;
    private readonly store;
    constructor(store: VectorStore);
    analyzePerformance(): PerformanceMetrics;
    optimizeHNSW(collectionName: string): Promise<HNSWConfig | null>;
    optimizeCache(): TuningRecommendation[];
    generateRecommendations(): TuningRecommendation[];
    shouldTune(): boolean;
    executeTuning(): Promise<TuningRecommendation[]>;
}
export {};
//# sourceMappingURL=auto-tuner.d.ts.map