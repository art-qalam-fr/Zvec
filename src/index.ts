#!/usr/bin/env node

// ===================================================================
// Zvec Multi-Store MCP Server
//
// Support for multiple vector stores with different data directories
// ===================================================================

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { config } from "dotenv";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { appendFileSync, existsSync, mkdirSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, "../.env"), override: true });

// Logging
const logFile = join(__dirname, "../debug.log");
function logToFile(message: string): void {
  try {
    appendFileSync(logFile, `[${new Date().toISOString()}] ${message}\n`);
  } catch {
    // ignore
  }
}

logToFile("=== Zvec Multi-Store MCP Server starting ===");

// Simple in-memory vector store implementation
interface VectorDocument {
  id: string;
  text: string;
  vector: number[];
  metadata?: Record<string, any>;
}

interface StoreInstance {
  dataDir: string;
  documents: Map<string, VectorDocument>;
  collections: Map<string, Set<string>>; // collection name -> set of doc IDs
}

// Map of store instances
const stores: Map<string, StoreInstance> = new Map();
let defaultStoreAlias = "default";

// Initialize or get a store
function getOrCreateStore(alias: string, dataDir?: string): StoreInstance {
  if (stores.has(alias)) {
    return stores.get(alias)!;
  }

  const resolvedDir = dataDir 
    ? resolve(dataDir) 
    : resolve(process.env.ZVEC_DATA_DIR || "./zvec-data");

  // Create directory if it doesn't exist
  if (!existsSync(resolvedDir)) {
    mkdirSync(resolvedDir, { recursive: true });
  }

  const store: StoreInstance = {
    dataDir: resolvedDir,
    documents: new Map(),
    collections: new Map(),
  };

  stores.set(alias, store);
  logToFile(`Created Zvec store '${alias}' at ${resolvedDir}`);
  
  return store;
}

function getStore(alias?: string): StoreInstance {
  const targetAlias = alias || defaultStoreAlias;
  const store = stores.get(targetAlias);
  if (!store) {
    throw new Error(`Store '${targetAlias}' not found. Use create_store first.`);
  }
  return store;
}

// Vector operations
function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function ensureCollection(store: StoreInstance, name: string): void {
  if (!store.collections.has(name)) {
    store.collections.set(name, new Set());
  }
}

function addDocument(
  store: StoreInstance,
  collection: string,
  doc: VectorDocument
): void {
  ensureCollection(store, collection);
  store.documents.set(doc.id, doc);
  store.collections.get(collection)!.add(doc.id);
}

function searchDocuments(
  store: StoreInstance,
  collection: string,
  queryVector: number[],
  limit: number = 5,
  filter?: Record<string, any>
): Array<{ id: string; score: number; text: string; metadata?: Record<string, any> }> {
  ensureCollection(store, collection);
  const docIds = store.collections.get(collection)!;
  
  const results: Array<{ id: string; score: number; text: string; metadata?: Record<string, any> }> = [];
  
  for (const docId of docIds) {
    const doc = store.documents.get(docId);
    if (!doc || !doc.vector) continue;

    // Apply filter if provided
    if (filter && Object.keys(filter).length > 0) {
      let matches = true;
      for (const [key, value] of Object.entries(filter)) {
        if (doc.metadata?.[key] !== value) {
          matches = false;
          break;
        }
      }
      if (!matches) continue;
    }

    const score = cosineSimilarity(queryVector, doc.vector);
    results.push({
      id: doc.id,
      score,
      text: doc.text,
      metadata: doc.metadata,
    });
  }

  // Sort by score descending
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, limit);
}

function deleteDocuments(store: StoreInstance, collection: string, ids: string[]): void {
  ensureCollection(store, collection);
  const collectionDocs = store.collections.get(collection)!;
  
  for (const id of ids) {
    collectionDocs.delete(id);
    store.documents.delete(id);
  }
}

function listCollections(store: StoreInstance): string[] {
  return Array.from(store.collections.keys());
}

function getCollectionInfo(store: StoreInstance, name: string): { name: string; count: number; vectorSize?: number } {
  ensureCollection(store, name);
  const docIds = store.collections.get(name)!;
  let vectorSize: number | undefined;
  
  // Get vector size from first document
  for (const docId of docIds) {
    const doc = store.documents.get(docId);
    if (doc?.vector) {
      vectorSize = doc.vector.length;
      break;
    }
  }
  
  return { name, count: docIds.size, vectorSize };
}

function deleteCollection(store: StoreInstance, name: string): void {
  const docIds = store.collections.get(name);
  if (docIds) {
    for (const id of docIds) {
      store.documents.delete(id);
    }
    store.collections.delete(name);
  }
}

// ===================================================================
// MCP Server Setup
// ===================================================================

const server = new Server(
  { name: "zvec-mcp-server-multi", version: "2.0.0" },
  { capabilities: { tools: {}, resources: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "zvec_create_store",
        description: "Create a new vector store with specific data directory",
        inputSchema: {
          type: "object",
          properties: {
            alias: { type: "string", description: "Alias for this store (default: 'default')" },
            data_dir: { type: "string", description: "Data directory for this store" },
          },
          required: ["alias"],
        },
      },
      {
        name: "zvec_list_stores",
        description: "List all configured vector stores",
        inputSchema: { type: "object", properties: {} },
      },
      {
        name: "zvec_switch_store",
        description: "Switch the default store alias",
        inputSchema: {
          type: "object",
          properties: {
            alias: { type: "string", description: "Store alias to set as default" },
          },
          required: ["alias"],
        },
      },
      {
        name: "zvec_create_collection",
        description: "Create a collection in specified store",
        inputSchema: {
          type: "object",
          properties: {
            name: { type: "string", description: "Collection name" },
            store_alias: { type: "string", description: "Store alias", default: "default" },
          },
          required: ["name"],
        },
      },
      {
        name: "zvec_list_collections",
        description: "List collections in specified store",
        inputSchema: {
          type: "object",
          properties: {
            store_alias: { type: "string", default: "default" },
          },
        },
      },
      {
        name: "zvec_get_collection_info",
        description: "Get collection info from specified store",
        inputSchema: {
          type: "object",
          properties: {
            name: { type: "string", description: "Collection name" },
            store_alias: { type: "string", default: "default" },
          },
          required: ["name"],
        },
      },
      {
        name: "zvec_delete_collection",
        description: "Delete collection from specified store",
        inputSchema: {
          type: "object",
          properties: {
            name: { type: "string", description: "Collection name" },
            store_alias: { type: "string", default: "default" },
          },
          required: ["name"],
        },
      },
      {
        name: "zvec_add_documents",
        description: "Add documents to collection in specified store",
        inputSchema: {
          type: "object",
          properties: {
            collection: { type: "string", description: "Collection name" },
            documents: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "string" },
                  text: { type: "string" },
                  vector: { type: "array", items: { type: "number" } },
                  metadata: { type: "object" },
                },
                required: ["id", "text", "vector"],
              },
            },
            store_alias: { type: "string", default: "default" },
          },
          required: ["collection", "documents"],
        },
      },
      {
        name: "zvec_semantic_search",
        description: "Search collection in specified store",
        inputSchema: {
          type: "object",
          properties: {
            collection: { type: "string" },
            query: { type: "string", description: "Search query (will be embedded if embeddings available)" },
            query_vector: { type: "array", items: { type: "number" }, description: "Query vector (optional if embeddings available)" },
            limit: { type: "number", default: 5 },
            filter: { type: "object" },
            store_alias: { type: "string", default: "default" },
          },
          required: ["collection"],
        },
      },
      {
        name: "zvec_delete_documents",
        description: "Delete documents from collection in specified store",
        inputSchema: {
          type: "object",
          properties: {
            collection: { type: "string" },
            ids: { type: "array", items: { type: "string" } },
            store_alias: { type: "string", default: "default" },
          },
          required: ["collection", "ids"],
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "zvec_create_store": {
        const { alias, data_dir } = args as { alias: string; data_dir?: string };
        const store = getOrCreateStore(alias, data_dir);
        
        if (stores.size === 1) {
          defaultStoreAlias = alias;
        }

        return {
          content: [
            {
              type: "text",
              text: `Created Zvec store '${alias}'\nDataDir: ${store.dataDir}\nTotal stores: ${stores.size}`,
            },
          ],
        };
      }

      case "zvec_list_stores": {
        const list = [];
        for (const [alias, store] of stores) {
          list.push(`- ${alias === defaultStoreAlias ? "[DEFAULT] " : ""}${alias}: ${store.dataDir}`);
        }
        return {
          content: [{ type: "text", text: `Stores (${stores.size}):\n${list.join("\n")}` }],
        };
      }

      case "zvec_switch_store": {
        const { alias } = args as { alias: string };
        if (!stores.has(alias)) {
          throw new Error(`Store '${alias}' not found`);
        }
        defaultStoreAlias = alias;
        return {
          content: [{ type: "text", text: `Switched to store: ${alias}` }],
        };
      }

      case "zvec_create_collection": {
        const { name, store_alias } = args as { name: string; store_alias?: string };
        const store = getStore(store_alias);
        ensureCollection(store, name);
        return {
          content: [{ type: "text", text: `Created collection '${name}' in store '${store_alias || defaultStoreAlias}'` }],
        };
      }

      case "zvec_list_collections": {
        const { store_alias } = args as { store_alias?: string };
        const store = getStore(store_alias);
        const collections = listCollections(store);
        return {
          content: [{ type: "text", text: `Collections in '${store_alias || defaultStoreAlias}': ${collections.join(", ") || "none"}` }],
        };
      }

      case "zvec_get_collection_info": {
        const { name, store_alias } = args as { name: string; store_alias?: string };
        const store = getStore(store_alias);
        const info = getCollectionInfo(store, name);
        return {
          content: [{ type: "text", text: `Collection: ${name}\nDocuments: ${info.count}\nVector size: ${info.vectorSize || "unknown"}` }],
        };
      }

      case "zvec_delete_collection": {
        const { name, store_alias } = args as { name: string; store_alias?: string };
        const store = getStore(store_alias);
        deleteCollection(store, name);
        return {
          content: [{ type: "text", text: `Deleted collection '${name}' from store '${store_alias || defaultStoreAlias}'` }],
        };
      }

      case "zvec_add_documents": {
        const { collection, documents, store_alias } = args as {
          collection: string;
          documents: Array<{ id: string; text: string; vector: number[]; metadata?: Record<string, any> }>;
          store_alias?: string;
        };
        const store = getStore(store_alias);
        
        for (const doc of documents) {
          addDocument(store, collection, {
            id: doc.id,
            text: doc.text,
            vector: doc.vector,
            metadata: doc.metadata,
          });
        }
        
        return {
          content: [{ type: "text", text: `Added ${documents.length} documents to '${collection}' in store '${store_alias || defaultStoreAlias}'` }],
        };
      }

      case "zvec_semantic_search": {
        const { collection, query_vector, limit, filter, store_alias } = args as {
          collection: string;
          query?: string;
          query_vector?: number[];
          limit?: number;
          filter?: Record<string, any>;
          store_alias?: string;
        };
        
        const store = getStore(store_alias);
        
        if (!query_vector) {
          throw new Error("query_vector is required for semantic search");
        }
        
        const results = searchDocuments(store, collection, query_vector, limit, filter);
        
        let response = `Search results (${results.length}):\n\n`;
        for (const r of results) {
          response += `ID: ${r.id}\nScore: ${r.score.toFixed(3)}\nText: ${r.text.substring(0, 100)}...\n\n`;
        }
        
        return {
          content: [{ type: "text", text: response }],
        };
      }

      case "zvec_delete_documents": {
        const { collection, ids, store_alias } = args as {
          collection: string;
          ids: string[];
          store_alias?: string;
        };
        const store = getStore(store_alias);
        deleteDocuments(store, collection, ids);
        return {
          content: [{ type: "text", text: `Deleted ${ids.length} documents from '${collection}' in store '${store_alias || defaultStoreAlias}'` }],
        };
      }

      default:
        return { content: [{ type: "text", text: `Unknown tool: ${name}` }], isError: true };
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logToFile(`Error in ${name}: ${msg}`);
    return { content: [{ type: "text", text: `Error: ${msg}` }], isError: true };
  }
});

// ===================================================================
// Start Server
// ===================================================================

async function main() {
  logToFile("Starting Zvec Multi-Store MCP Server...");

  // Create default store
  const defaultDataDir = process.env.ZVEC_DATA_DIR || "./zvec-data";
  getOrCreateStore("default", defaultDataDir);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  logToFile("Zvec Multi-Store MCP Server ready");
}

main().catch((error) => {
  logToFile(`Fatal error: ${error}`);
  process.exit(1);
});
