// Tiny static server for dist-preview/: node tools/preview/serve.mjs [port] (default 8080)
import { createReadStream, statSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../dist-preview");
const port = Number(process.argv[2]) || 8080;
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};

createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url || "/", "http://x").pathname);
  let file = normalize(join(root, pathname === "/" ? "index.html" : pathname));
  if (file !== root && !file.startsWith(root + sep)) {
    res.writeHead(403).end("Forbidden");
    return;
  }
  try {
    if (statSync(file).isDirectory()) file = join(file, "index.html");
    statSync(file);
  } catch {
    res.writeHead(404, { "Cache-Control": "no-store" }).end("Not found");
    return;
  }
  res.writeHead(200, {
    "Content-Type": types[extname(file)] || "application/octet-stream",
    "Cache-Control": "no-store",
  });
  createReadStream(file).pipe(res);
}).listen(port, "127.0.0.1", () => console.log(`Preview: http://127.0.0.1:${port}/index.html`));
