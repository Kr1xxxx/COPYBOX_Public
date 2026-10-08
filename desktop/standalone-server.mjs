#!/usr/bin/env node
import { join } from "node:path";
import { startProdServer } from "vinext/server/prod-server";

const port = Number.parseInt(process.env.PORT ?? "47831", 10);
const host = process.env.HOST ?? "127.0.0.1";

try {
  const result = await startProdServer({
    port,
    host,
    outDir: join(import.meta.dirname, "dist"),
  });
  process.send?.({
    type: "clipbox:server-ready",
    nonce: process.env.CLIPBOX_SERVER_NONCE,
    port: result.port,
  });
} catch (error) {
  console.error("[vinext] Failed to start standalone server");
  console.error(error);
  process.exit(1);
}
