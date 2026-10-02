export class LearningEngine {
    interactions = [];
    insights = [];
    maxInteractions = 1000;
    maxInsights = 500;
    store;
    learningCollection = "learning_insights";
    constructor(store) {
        this.store = store;
        this.initializeLearningCollection();
    }
    // Initialize learning collection if it doesn't exist
    initializeLearningCollection() {
        try {
            if (!this.store.collectionExists(this.learningCollection)) {
                this.store.createCollection(this.learningCollection, 384, "Cosine", false);
                console.error(`Created learning collection: ${this.learningCollection}`);
            }
        }
        catch (error) {
            console.warn(`Failed to initialize learning collection: ${error}`);
        }
    }
    // Record a user interaction
    recordInteraction(interaction) {
        this.interactions.push(interaction);
        // Keep only recent interactions
        if (this.interactions.length > this.maxInteractions) {
            this.interactions.shift();
        }
        // Trigger learning analysis if enough data
        if (this.interactions.length >= 10) {
            this.analyzeAndLearn();
        }
    }
    // Analyze interactions and generate insights
    analyzeInteractions() {
        const analysis = {
            totalInteractions: this.interactions.length,
            successRate: 0,
            avgResponseTime: 0,
            popularQueries: {},
            searchTypeDistribution: {},
            performanceIssues: [],
            learningOpportunities: []
        };
        if (this.interactions.length === 0)
            return analysis;
        // Calculate basic metrics
        const successful = this.interactions.filter(i => i.success).length;
        analysis.successRate = (successful / this.interactions.length) * 100;
        analysis.avgResponseTime = this.interactions.reduce((sum, i) => sum + i.responseTime, 0) / this.interactions.length;
        // Analyze queries
        for (const interaction of this.interactions) {
            // Popular queries
            const query = interaction.query.toLowerCase();
            analysis.popularQueries[query] = (analysis.popularQueries[query] || 0) + 1;
            // Search types
            const searchType = interaction.metadata?.search_type;
            if (searchType) {
                analysis.searchTypeDistribution[searchType] = (analysis.searchTypeDistribution[searchType] || 0) + 1;
            }
        }
        // Detect performance issues
        const slowQueries = this.interactions.filter(i => i.responseTime > 300);
        if (slowQueries.length > this.interactions.length * 0.1) { // >10% slow
            analysis.performanceIssues.push(`${slowQueries.length} requêtes lentes détectées (>300ms)`);
        }
        if (analysis.successRate < 90) {
            analysis.performanceIssues.push(`Taux de succès faible: ${analysis.successRate.toFixed(1)}%`);
        }
        // Identify learning opportunities
        const failedQueries = this.interactions.filter(i => !i.success);
        if (failedQueries.length > 0) {
            analysis.learningOpportunities.push(`${failedQueries.length} échecs - améliorer gestion erreurs`);
        }
        const lowResultQueries = this.interactions.filter(i => (i.metadata?.result_count || 0) < 3);
        if (lowResultQueries.length > this.interactions.length * 0.2) { // >20% low results
            analysis.learningOpportunities.push(`${lowResultQueries.length} faibles résultats - enrichir base connaissances`);
        }
        return analysis;
    }
    // Generate insights from analysis
    generateInsights(analysis) {
        const insights = [];
        const timestamp = new Date().toISOString();
        // Performance insights
        if (analysis.successRate < 90) {
            insights.push({
                id: `insight_perf_${Date.now()}_success`,
                type: 'performance',
                content: `Taux de succès faible (${analysis.successRate.toFixed(1)}%) - optimiser gestion erreurs`,
                priority: 'high',
                confidence: 0.9,
                generatedAt: timestamp
            });
        }
        if (analysis.avgResponseTime > 200) {
            insights.push({
                id: `insight_perf_${Date.now()}_speed`,
                type: 'performance',
                content: `Temps réponse élevé (${analysis.avgResponseTime.toFixed(0)}ms) - optimiser cache/index`,
                priority: 'high',
                confidence: 0.85,
                generatedAt: timestamp
            });
        }
        // Usage insights
        const topQueries = Object.entries(analysis.popularQueries)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 3);
        for (const [query, count] of topQueries) {
            insights.push({
                id: `insight_usage_${Date.now()}_${query.replace(/\s+/g, '_').substring(0, 10)}`,
                type: 'usage',
                content: `Requête populaire: "${query}" (${count} utilisations)`,
                priority: count > 5 ? 'medium' : 'low',
                confidence: 0.8,
                generatedAt: timestamp
            });
        }
        // Search type insights
        const totalSearches = Object.values(analysis.searchTypeDistribution).reduce((sum, count) => sum + count, 0);
        for (const [type, count] of Object.entries(analysis.searchTypeDistribution)) {
            const percentage = (count / totalSearches * 100).toFixed(1);
            insights.push({
                id: `insight_search_${Date.now()}_${type}`,
                type: 'search',
                content: `Type recherche '${type}': ${percentage}% des requêtes`,
                priority: 'low',
                confidence: 0.75,
                generatedAt: timestamp
            });
        }
        // Learning insights
        for (const opportunity of analysis.learningOpportunities) {
            insights.push({
                id: `insight_learn_${Date.now()}_${opportunity.replace(/\s+/g, '_').substring(0, 10)}`,
                type: 'learning',
                content: opportunity,
                priority: 'medium',
                confidence: 0.7,
                generatedAt: timestamp
            });
        }
        return insights;
    }
    // Store insights in learning collection
    async storeInsights(insights) {
        if (insights.length === 0)
            return 0;
        try {
            // Convert insights to documents
            const documents = [];
            for (const insight of insights) {
                // Create a simple embedding (in real implementation, use actual embeddings)
                const vector = Array.from({ length: 384 }, () => Math.random() * 2 - 1); // Random vector for demo
                const text = `[${insight.type.toUpperCase()}] ${insight.content} - Priorité: ${insight.priority}`;
                const metadata = {
                    type: insight.type,
                    priority: insight.priority,
                    confidence: insight.confidence,
                    generatedAt: insight.generatedAt
                };
                documents.push({
                    id: insight.id,
                    text,
                    vector,
                    metadata
                });
            }
            // Store in learning collection
            this.store.addDocuments(this.learningCollection, documents);
            console.error(`Stored ${insights.length} insights in learning collection`);
            return insights.length;
        }
        catch (error) {
            console.error(`Failed to store insights: ${error}`);
            return 0;
        }
    }
    // Main learning method
    async analyzeAndLearn() {
        try {
            console.error("=== Continuous Learning Analysis ===");
            // Analyze interactions
            const analysis = this.analyzeInteractions();
            console.error(`Analyzed ${analysis.totalInteractions} interactions`);
            // Generate insights
            const newInsights = this.generateInsights(analysis);
            console.error(`Generated ${newInsights.length} insights`);
            // Filter out existing insights (avoid duplicates)
            const existingInsightIds = new Set(this.insights.map(i => i.id));
            const uniqueInsights = newInsights.filter(i => !existingInsightIds.has(i.id));
            if (uniqueInsights.length > 0) {
                // Store new insights
                const storedCount = await this.storeInsights(uniqueInsights);
                console.error(`Stored ${storedCount} new insights`);
                // Add to local cache
                this.insights.push(...uniqueInsights);
                // Keep only recent insights
                if (this.insights.length > this.maxInsights) {
                    this.insights = this.insights.slice(-this.maxInsights);
                }
                console.error(`Learning complete: ${uniqueInsights.length} insights generated`);
            }
            else {
                console.error("No new insights generated");
            }
        }
        catch (error) {
            console.error(`Learning analysis failed: ${error}`);
        }
    }
    // Get recent insights
    getRecentInsights(limit = 10) {
        return this.insights
            .sort((a, b) => new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime())
            .slice(0, limit);
    }
    // Get learning statistics
    getLearningStats() {
        const insightsByType = {};
        let totalConfidence = 0;
        for (const insight of this.insights) {
            insightsByType[insight.type] = (insightsByType[insight.type] || 0) + 1;
            totalConfidence += insight.confidence;
        }
        return {
            totalInteractions: this.interactions.length,
            totalInsights: this.insights.length,
            insightsByType,
            avgConfidence: this.insights.length > 0 ? totalConfidence / this.insights.length : 0
        };
    }
}
//# sourceMappingURL=learning-engine.js.map