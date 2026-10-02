// test-server.mjs - Test the Zvec MCP Server via JSON-RPC over stdio
import { spawn } from "node:child_process";

const serverProcess = spawn(
    "C:\\nvm4w\\nodejs\\node.exe",
    ["<HEPHAISTOS_ROOT>\\servers\\zvec-mcp-server\\build\\index.js"],
    {
        stdio: ["pipe", "pipe", "pipe"],
        env: {
            ...process.env,
            EMBEDDING_PROVIDER: "mistral",
            EMBEDDING_MODEL: "mistral-embed",
            MISTRAL_API_KEY: process.env.MISTRAL_API_KEY || "VOTRE_CLE_MISTRAL",
            EMBEDDING_DIMENSIONS: "1536",
            EMBEDDING_BASE_URL: "https://api.mistral.ai/v1",
            ZVEC_DATA_DIR: process.env.ZVEC_DATA_DIR || "./data/zvec-data",
            TRANSPORT_MODE: "stdio",
            LOG_LEVEL: "warn",
        },
    }
);

let buffer = "";
const responses = [];

serverProcess.stdout.on("data", (data) => {
    buffer += data.toString();
    // Try to parse JSON-RPC responses (newline delimited)
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed) {
            try {
                const parsed = JSON.parse(trimmed);
                responses.push(parsed);
                console.log(`\n=== Response ${responses.length} ===`);
                console.log(JSON.stringify(parsed, null, 2));
            } catch {
                // Not JSON, skip
            }
        }
    }
});

serverProcess.stderr.on("data", (data) => {
    // Just collect, don't print
});

function send(msg) {
    const json = JSON.stringify(msg);
    serverProcess.stdin.write(json + "\n");
}

// Step 1: Initialize
console.log(">>> Sending initialize...");
send({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "test-client", version: "1.0.0" },
    },
});

// Wait a bit for response, then send notification + list tools
setTimeout(() => {
    console.log("\n>>> Sending initialized notification...");
    send({ jsonrpc: "2.0", method: "notifications/initialized" });

    console.log(">>> Sending tools/list...");
    send({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
}, 2000);

// Wait for tools/list response, then test create_collection
setTimeout(() => {
    console.log("\n>>> Testing create_collection...");
    send({
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: {
            name: "create_collection",
            arguments: { name: "test_collection", distance: "Cosine", enableHybrid: true },
        },
    });
}, 4000);

// Test list_collections
setTimeout(() => {
    console.log("\n>>> Testing list_collections...");
    send({
        jsonrpc: "2.0",
        id: 4,
        method: "tools/call",
        params: { name: "list_collections", arguments: {} },
    });
}, 5000);

// Test get_collection_info
setTimeout(() => {
    console.log("\n>>> Testing get_collection_info...");
    send({
        jsonrpc: "2.0",
        id: 5,
        method: "tools/call",
        params: { name: "get_collection_info", arguments: { name: "test_collection" } },
    });
}, 6000);

// Test delete_collection (cleanup)
setTimeout(() => {
    console.log("\n>>> Testing delete_collection...");
    send({
        jsonrpc: "2.0",
        id: 6,
        method: "tools/call",
        params: { name: "delete_collection", arguments: { name: "test_collection" } },
    });
}, 7000);

// Final summary
setTimeout(() => {
    console.log("\n\n========================================");
    console.log(`Total responses received: ${responses.length}`);
    console.log("========================================");

    if (responses.length >= 2) {
        // Check tools/list response
        const toolsResp = responses.find((r) => r.id === 2);
        if (toolsResp && toolsResp.result && toolsResp.result.tools) {
            console.log(`\nTools found: ${toolsResp.result.tools.length}`);
            console.log("Tool names:");
            for (const tool of toolsResp.result.tools) {
                console.log(`  - ${tool.name}`);
            }
        }
    }

    console.log("\n>>> Test complete. Shutting down...");
    serverProcess.kill();
    process.exit(0);
}, 9000);
