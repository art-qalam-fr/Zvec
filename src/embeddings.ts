import { config } from "dotenv";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DefaultLocalDenseEmbedding } from "./embedding-functions.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, "../.env"), override: true });

// ===================================================================
// Embeddings Provider
// - Mode "local" (par défaut) : utilise les embeddings Sentence Transformers via @xenova/transformers
// - Modes "mistral" / "openai" : compatibilité API distante si nécessaire
// ===================================================================

const PROVIDER = (process.env.ZVEC_EMBEDDING_PROVIDER || process.env.EMBEDDING_PROVIDER || "local").toLowerCase();
const REMOTE_MODEL = process.env.EMBEDDING_MODEL || "mistral-embed";
const REMOTE_DIMENSIONS = parseInt(process.env.EMBEDDING_DIMENSIONS || "1536", 10);
const REMOTE_BASE_URL = process.env.EMBEDDING_BASE_URL || "https://api.mistral.ai/v1";

function resolveApiKey(provider: string): string {
    switch (provider) {
        case "mistral":
            return process.env.MISTRAL_API_KEY || "";
        case "openai":
            return process.env.OPENAI_API_KEY || "";
        default:
            return "";
    }
}

export interface EmbeddingResult {
    embedding: number[];
    tokenCount: number;
}

export class EmbeddingProvider {
    private readonly provider: string;
    private readonly denseEmbedding = new DefaultLocalDenseEmbedding();
    private readonly apiKey: string;
    private readonly baseUrl: string;
    private readonly remoteModel: string;
    private readonly remoteDimensions: number;

    constructor() {
        this.provider = PROVIDER;
        this.apiKey = resolveApiKey(this.provider);
        this.baseUrl = REMOTE_BASE_URL;
        this.remoteModel = REMOTE_MODEL;
        this.remoteDimensions = REMOTE_DIMENSIONS;

        if (this.provider !== "local" && !this.apiKey) {
            throw new Error(
                `API key not found for provider "${this.provider}". ` +
                `Set the appropriate environment variable (e.g., MISTRAL_API_KEY).`
            );
        }
    }

    getDimensions(): number {
        if (this.provider === "local") {
            return this.denseEmbedding.dimension;
        }
        return this.remoteDimensions;
    }

    async embed(text: string): Promise<EmbeddingResult> {
        const results = await this.embedBatch([text]);
        return results[0];
    }

    async embedBatch(texts: string[]): Promise<EmbeddingResult[]> {
        if (this.provider === "local") {
            const vectors = await this.denseEmbedding.embedBatch(texts);
            return vectors.map((embedding) => ({ embedding, tokenCount: 0 }));
        }

        const response = await fetch(`${this.baseUrl}/embeddings`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${this.apiKey}`,
            },
            body: JSON.stringify({
                model: this.remoteModel,
                input: texts,
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Embedding API error (${response.status}): ${errorText}`);
        }

        const data = await response.json() as {
            data: Array<{ embedding: number[]; index: number }>;
            usage?: { prompt_tokens: number; total_tokens: number };
        };

        const sorted = data.data.sort((a, b) => a.index - b.index);

        return sorted.map((item) => ({
            embedding: item.embedding,
            tokenCount: data.usage?.prompt_tokens
                ? Math.floor(data.usage.prompt_tokens / texts.length)
                : 0,
        }));
    }
}
