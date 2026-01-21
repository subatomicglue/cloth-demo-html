#!/usr/bin/env bash
set -euo pipefail

PORT="${1:-8080}"
DOC_ROOT="$(cd "$(dirname "$0")" && pwd)"

have() {
  command -v "$1" >/dev/null 2>&1
}

log() {
  printf '[start_http] %s\n' "$1"
}

log "Serving files from ${DOC_ROOT}"
log "Open http://localhost:${PORT} in Chrome or Safari"

if have node; then
  log "Starting Node static server"
  exec node - "$DOC_ROOT" "$PORT" <<'NODE'
const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const root = process.argv[2];
const port = Number(process.argv[3]) || 8080;

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.wasm': 'application/wasm',
  '.txt': 'text/plain; charset=utf-8'
};

const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url);
  let pathname = decodeURIComponent(parsed.pathname);
  if (pathname.endsWith('/')) pathname += 'index.html';
  let filePath = path.join(root, pathname);

  if (!filePath.startsWith(root)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.stat(filePath, (err, stat) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }

    if (stat.isDirectory()) {
      filePath = path.join(filePath, 'index.html');
    }

    const ext = path.extname(filePath).toLowerCase();
    const type = mimeTypes[ext] || 'application/octet-stream';
    const stream = fs.createReadStream(filePath);

    stream.on('open', () => {
      res.writeHead(200, { 'Content-Type': type });
      stream.pipe(res);
    });

    stream.on('error', () => {
      res.writeHead(500);
      res.end('Error reading file');
    });
  });
});

server.listen(port, () => {
  console.log(`[start_http] Node server ready on http://localhost:${port}`);
});
NODE
fi

if have python3; then
  log "Node not found; falling back to python3"
  exec python3 -m http.server "$PORT" --directory "$DOC_ROOT"
elif have python; then
  log "Node not found; falling back to python"
  exec python -m SimpleHTTPServer "$PORT"
else
  log "Neither Node nor Python is installed. Cannot start server."
  exit 1
fi
