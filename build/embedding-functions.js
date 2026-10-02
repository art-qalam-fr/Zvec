import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, mkdirSync } from "node:fs";
const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_MODEL = process.env.ZVEC_DENSE_MODEL || "Xenova/all-MiniLM-L6-v2";
const DEFAULT_CACHE_DIR = process.env.ZVEC_MODEL_CACHE || join(__dirname, "../.models");
if (!existsSync(DEFAULT_CACHE_DIR)) {
    mkdirSync(DEFAULT_CACHE_DIR, { recursive: true });
}
let densePipelinePromise = null;
async function getDensePipeline(model) {
    if (!densePipelinePromise) {
        const { pipeline } = await import("@xenova/transformers");
        densePipelinePromise = pipeline("feature-extraction", model, {
            quantized: true,
            cache_dir: DEFAULT_CACHE_DIR,
        });
    }
    return densePipelinePromise;
}
function tensorToArray(tensor) {
    if (!tensor) {
        return [];
    }
    if (Array.isArray(tensor)) {
        return tensor.flat(Number.POSITIVE_INFINITY);
    }
    if (typeof tensor.tolist === "function") {
        const list = tensor.tolist();
        return Array.isArray(list) ? list.flat(Number.POSITIVE_INFINITY) : [list];
    }
    if (tensor.data) {
        return Array.from(tensor.data);
    }
    return [];
}
export class DefaultLocalDenseEmbedding {
    dimension;
    model;
    constructor(options) {
        this.model = options?.model || DEFAULT_MODEL;
        this.dimension = 384; // all-MiniLM-L6-v2 output size
    }
    async embed(text) {
        const pipeline = await getDensePipeline(this.model);
        const output = await pipeline(text, { pooling: "mean", normalize: true });
        return tensorToArray(output).slice(0, this.dimension);
    }
    async embedBatch(texts) {
        const results = [];
        for (const text of texts) {
            results.push(await this.embed(text));
        }
        return results;
    }
}
export class DefaultLocalSparseEmbedding {
    stopWords = new Set([
        "the", "a", "an", "and", "or", "is", "are", "to", "in", "of", "for", "on",
        "la", "le", "les", "un", "une", "des", "et", "ou", "est", "sont",
    ]);
    async embed(text) {
        return this.computeWeights(text);
    }
    async embedBatch(texts) {
        return texts.map((t) => this.computeWeights(t));
    }
    computeWeights(text) {
        const tokens = text
            .toLowerCase()
            .replace(/[^\p{L}\p{N}\s]/gu, " ")
            .split(/\s+/)
            .filter((token) => token.length > 1 && !this.stopWords.has(token));
        const counts = new Map();
        for (const token of tokens) {
            counts.set(token, (counts.get(token) || 0) + 1);
        }
        const total = tokens.length || 1;
        for (const [token, value] of counts) {
            counts.set(token, value / total);
        }
        return counts;
    }
}
//# sourceMappingURL=embedding-functions.js.map