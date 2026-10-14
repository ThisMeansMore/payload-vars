import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { networkInterfaces } from 'node:os';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const docsRoot = fileURLToPath(new URL('../docs/', import.meta.url));
const host = process.env.PAYLOAD_VARS_PLAYGROUND_HOST ?? '0.0.0.0';
const port = Number(process.env.PAYLOAD_VARS_PLAYGROUND_PORT ?? 4173);
const contentTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
]);

function isTailscaleAddress(address) {
  const [first, second] = address.split('.').map(Number);
  return first === 100 && second >= 64 && second <= 127;
}

export function playgroundUrls(bindHost = host, bindPort = port, interfaces = networkInterfaces()) {
  const path = '/playground.html';
  if (bindHost !== '0.0.0.0' && bindHost !== '::') {
    const local = bindHost === '127.0.0.1' || bindHost === 'localhost';
    return [{ label: local ? 'Local' : isTailscaleAddress(bindHost) ? 'Tailscale' : 'Network',
      url: `http://${bindHost}:${bindPort}${path}` }];
  }
  const addresses = new Set();
  for (const entries of Object.values(interfaces)) {
    for (const entry of entries ?? []) {
      if ((entry.family === 'IPv4' || entry.family === 4) && !entry.internal) addresses.add(entry.address);
    }
  }
  const networkUrls = [...addresses].map(address => ({
    label: isTailscaleAddress(address) ? 'Tailscale' : 'Network',
    url: `http://${address}:${bindPort}${path}`,
  })).sort((left, right) => {
    const labelOrder = Number(right.label === 'Tailscale') - Number(left.label === 'Tailscale');
    return labelOrder || left.url.localeCompare(right.url);
  });
  return [{ label: 'Local', url: `http://localhost:${bindPort}${path}` }, ...networkUrls];
}

export function renderPlaygroundPage(source) {
  const content = source
    .replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '')
    .replace(/\{%\s*(?:end)?raw\s*%\}/g, '');
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>payload-vars playground</title>
  <style>
    body { background: #fbfcfe; font-family: Inter, ui-sans-serif, system-ui, sans-serif; margin: 0; padding: 0 1.25rem 3rem; }
  </style>
</head>
<body>${content}</body>
</html>`;
}

async function respond(request, response) {
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? host}`);
  if (url.pathname === '/') {
    response.writeHead(302, { location: '/playground.html' });
    response.end();
    return;
  }
  let relativePath;
  try {
    relativePath = decodeURIComponent(url.pathname).replace(/^\/+/, '');
  } catch {
    response.writeHead(400).end('Bad request');
    return;
  }
  const filePath = resolve(docsRoot, relativePath);
  if (!filePath.startsWith(`${resolve(docsRoot)}${sep}`)) {
    response.writeHead(403).end('Forbidden');
    return;
  }
  try {
    let content = await readFile(filePath);
    if (relativePath === 'playground.html') content = renderPlaygroundPage(content.toString());
    response.writeHead(200, {
      'cache-control': 'no-store',
      'content-type': contentTypes.get(extname(filePath)) ?? 'application/octet-stream',
    });
    response.end(content);
  } catch (error) {
    if (error?.code !== 'ENOENT') console.error(error);
    response.writeHead(error?.code === 'ENOENT' ? 404 : 500).end(error?.code === 'ENOENT' ? 'Not found' : 'Server error');
  }
}

export function startPlaygroundServer() {
  const server = createServer((request, response) => void respond(request, response));
  server.listen(port, host, () => {
    console.log('payload-vars playground');
    for (const { label, url } of playgroundUrls()) console.log(`  ${label.padEnd(10)} ${url}`);
    if (host === '0.0.0.0' || host === '::') {
      console.log('  Serving all interfaces; set PAYLOAD_VARS_PLAYGROUND_HOST=127.0.0.1 for local-only access.');
    }
    console.log('Press Ctrl+C to stop.');
  });
  server.on('error', error => {
    if (error.code === 'EADDRINUSE') {
      console.error(`Port ${port} is already in use. Set PAYLOAD_VARS_PLAYGROUND_PORT to another port.`);
      process.exitCode = 1;
      return;
    }
    throw error;
  });
  return server;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) startPlaygroundServer();
