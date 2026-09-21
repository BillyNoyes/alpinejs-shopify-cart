import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';

const root = resolve('.');
createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://localhost');
    const path = resolve(root, `.${decodeURIComponent(url.pathname)}`);
    if (!path.startsWith(root + sep)) throw new Error('Not found');
    let content = await readFile(path);
    const headers = { 'Content-Type': extname(path) === '.html' ? 'text/html' : 'text/javascript' };
    if (url.searchParams.has('csp')) {
      content = content.toString().replace('node_modules/alpinejs/', 'node_modules/@alpinejs/csp/');
      headers['Content-Security-Policy'] = "script-src 'self'; object-src 'none'; base-uri 'none'";
    }
    response.writeHead(200, headers);
    response.end(content);
  } catch {
    response.writeHead(404);
    response.end('Not found');
  }
}).listen(4180, '127.0.0.1');
