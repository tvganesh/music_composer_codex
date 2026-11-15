import http from 'node:http';
import { promises as fs, constants } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { openProject, saveProject, MAX_PROJECT_BYTES, validateMelodySource } from './project.js?v=0.7.0';
import { refineWithModel, modelStatus } from './local-model.js';

const assets = new Set(['index.html', 'style.css', 'app.js', 'composer.js', 'arrangement.js', 'chord-edit.js', 'scales.js', 'project.js', 'refinement.js']);
const safeName = name => /^[A-Za-z0-9][A-Za-z0-9._-]{0,180}\.json$/.test(name);
const fail = (status, message) => Object.assign(new Error(message), { status });
const json = (res, status, value) => { res.writeHead(status, { 'Content-Type':'application/json', 'Cache-Control':'no-store' }); res.end(JSON.stringify(value)); };
function body(req) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on('data', chunk => { size += chunk.length; if (size <= MAX_PROJECT_BYTES) chunks.push(chunk); });
    req.on('end', () => size > MAX_PROJECT_BYTES ? reject(fail(413, 'Project files must be smaller than 2 MB.')) : resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}
export async function createComposerServer(root = path.dirname(fileURLToPath(import.meta.url)), { refiner = refineWithModel, status = modelStatus } = {}) {
  const data = path.join(root, 'data');
  await fs.mkdir(data, { recursive:true });
  if (path.dirname(await fs.realpath(data)) !== await fs.realpath(root)) throw new Error('data/ must be a directory inside this project.');
  let refining = false;
  return http.createServer(async (req, res) => {
    try {
      const host = req.headers.host || '';
      if (!/^(127\.0\.0\.1|localhost):\d+$/.test(host)) throw fail(403, 'Use the local server address.');
      const url = new URL(req.url, `http://${host}`), route = url.pathname;
      if (route.startsWith('/api/')) {
        if (req.headers.origin && req.headers.origin !== `http://${host}`) throw fail(403, 'Open this app from the local server.');
        if (route === '/api/model' && req.method === 'GET') return json(res, 200, await status());
        if (route === '/api/refine' && req.method === 'POST') {
          if (!req.headers['content-type']?.startsWith('application/json')) throw fail(415, 'Send a JSON melody.');
          if (refining) throw fail(409, 'A melody revision is already running. Try again shortly.');
          let piece;
          try { piece = JSON.parse(await body(req)).piece; validateMelodySource(piece); }
          catch (error) { throw fail(error.status || 400, error.message); }
          if (refining) throw fail(409, 'A melody revision is already running. Try again shortly.');
          refining = true;
          const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 180000);
          const cancelled = () => { if (!res.writableEnded) controller.abort(); }; res.on('close', cancelled);
          try { return json(res, 200, await refiner(piece, { signal:controller.signal })); }
          catch (error) { throw fail(controller.signal.aborted ? 504 : 502, controller.signal.aborted ? 'Melody revision cancelled or timed out. Try again.' : error.message === 'fetch failed' ? 'Cannot reach the local model. Start Ollama and try again.' : error.message); }
          finally { clearTimeout(timer); res.off('close', cancelled); refining = false; }
        }
        if (route === '/api/projects' && req.method === 'POST') {
          if (!req.headers['content-type']?.startsWith('application/json')) throw fail(415, 'Send a JSON project.');
          let state;
          try { state = openProject(await body(req)); } catch (error) { throw fail(error.status || 400, error.message); }
          const idea = state.ideas[state.selected];
          const name = `sketch-${idea.key.replace('#', 'sharp')}-${idea.scale}-${Date.now()}-${randomUUID().slice(0, 8)}.json`;
          await fs.writeFile(path.join(data, name), saveProject(state), { flag:'wx' });
          return json(res, 201, { name, path:`data/${name}` });
        }
        if (route === '/api/projects' && req.method === 'GET') {
          const entries = await fs.readdir(data, { withFileTypes:true }), projects = [];
          for (const entry of entries) if (entry.isFile() && safeName(entry.name)) {
            const stat = await fs.stat(path.join(data, entry.name)); projects.push({ name:entry.name, modifiedAt:stat.mtime.toISOString() });
          }
          projects.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
          return json(res, 200, { projects });
        }
        if (route.startsWith('/api/projects/') && req.method === 'GET') {
          const name = decodeURIComponent(route.slice('/api/projects/'.length));
          if (!safeName(name)) throw fail(400, 'Invalid project filename.');
          const handle = await fs.open(path.join(data, name), constants.O_RDONLY | constants.O_NOFOLLOW);
          try {
            const stat = await handle.stat();
            if (!stat.isFile() || stat.size > MAX_PROJECT_BYTES) throw fail(400, 'Invalid project file.');
            const text = await handle.readFile('utf8');
            try { openProject(text); } catch (error) { throw fail(400, error.message); }
            res.writeHead(200, { 'Content-Type':'application/json', 'Cache-Control':'no-store' }); return res.end(text);
          } finally { await handle.close(); }
        }
        throw fail(404, 'Project action not found.');
      }
      const asset = route === '/' ? 'index.html' : route.slice(1);
      if (!assets.has(asset) || !['GET', 'HEAD'].includes(req.method)) throw fail(404, 'File not found.');
      const bytes = await fs.readFile(path.join(root, asset));
      const type = asset.endsWith('.js') ? 'text/javascript' : asset.endsWith('.css') ? 'text/css' : 'text/html';
      res.writeHead(200, { 'Content-Type':type, 'Cache-Control':'no-store' }); res.end(req.method === 'HEAD' ? undefined : bytes);
    } catch (error) {
      if (res.destroyed) return;
      const status = error.status || (['ENOENT', 'ELOOP'].includes(error.code) ? 404 : 500);
      json(res, status, { error:status === 500 ? 'Local server could not complete the request.' : error.message });
    }
  });
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = await createComposerServer(), port = Number(process.env.PORT || 8000);
  server.on('error', error => { console.error(error.code === 'EADDRINUSE' ? `Port ${port} is in use. Stop the old server with Ctrl+C, then run npm start again.` : error.message); process.exitCode = 1; });
  server.listen(port, '127.0.0.1', () => console.log(`Sketch Composer: http://127.0.0.1:${port}\nProjects save to ${path.join(path.dirname(fileURLToPath(import.meta.url)), 'data')}`));
}
