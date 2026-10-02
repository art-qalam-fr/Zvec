import { VectorStore } from "./vector-store.js";
interface UserInteraction {
    timestamp: string;
    userId: string;
    query: string;
    response: string;
    responseTime: number;
    success: boolean;
    metadata: Record<string, unknown>;
}
interface LearningInsight {
    id: string;
    type: 'performance' | 'usage' | 'search' | 'learning';
    content: string;
    priority: 'high' | 'medium' | 'low';
    confidence: number;
    generatedAt: string;
}
export declare class LearningEngine {
    private interactions;
    private insights;
    private maxInteractions;
    private maxInsights;
    private readonly store;
    private learningCollection;
    constructor(store: VectorStore);
    private initializeLearningCollection;
    recordInteraction(interaction: UserInteraction): void;
    private analyzeInteractions;
    private generateInsights;
    private storeInsights;
    private analyzeAndLearn;
    getRecentInsights(limit?: number): LearningInsight[];
    getLearningStats(): {
        totalInteractions: number;
        totalInsights: number;
        insightsByType: Record<string, number>;
        avgConfidence: number;
    };
}
export {};
//# sourceMappingURL=learning-engine.d.ts.map