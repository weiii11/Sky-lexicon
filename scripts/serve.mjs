import http from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../dist/', import.meta.url));
const port = Number(process.env.PORT ?? 5173);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be between 1 and 65535');
if (!existsSync(path.join(root, 'index.html'))) { console.error('尚未构建游戏。请先运行 pnpm build。'); process.exit(1); }
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); res.end(); return; }
  let filename;
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    filename = path.resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
    const relative = path.relative(root, filename);
    if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Invalid path');
  } catch { res.writeHead(400); res.end('Bad request'); return; }
  if (!existsSync(filename) || !statSync(filename).isFile()) { res.writeHead(404); res.end('Not found'); return; }
  res.writeHead(200, { 'Content-Type': types[path.extname(filename)] ?? 'application/octet-stream', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
  if (req.method === 'HEAD') res.end();
  else { const stream = createReadStream(filename); stream.on('error', () => res.destroy()); stream.pipe(res); }
});
server.on('error', error => {
  console.error(error.code === 'EADDRINUSE' ? `端口 ${port} 已有服务。先打开 http://127.0.0.1:${port}/ 看看，或关闭旧服务后重试。` : error.message);
  process.exitCode = 1;
});
server.listen(port, '127.0.0.1', () => console.log(`\n云间词屿已启动： http://127.0.0.1:${port}/\n在浏览器中打开这个地址。关闭本窗口即可停止服务。\n`));
process.on('SIGINT', () => server.close());
