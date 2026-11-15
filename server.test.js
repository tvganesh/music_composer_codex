import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createComposerServer } from './server.js';
import { compose, midiBytes } from './composer.js';
import { arrange } from './arrangement.js';
import { saveProject, openProject, MAX_PROJECT_BYTES } from './project.js';
import { buildEditCatalog, validateRevisions } from './refinement.js';
import { decodeModelChoices } from './local-model.js';

test('local server saves and reopens projects in data/ and rejects invalid file access', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'composer-server-'));
  const server = await createComposerServer(root);
  t.after(async () => { if (server.listening) await new Promise(resolve => server.close(resolve)); await fs.rm(root, { recursive:true, force:true }); });
  await fs.writeFile(path.join(root, 'index.html'), '<h1>Composer</h1>');
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const ideas = [1, 19, 42].map(seed => compose({ seed }));
  const state = { ideas, selected:1, song:arrange(ideas[1]), sectionIndex:2, harmony:'intermediate', accompaniment:true,
    inputs:{ key:'A', scale:'minor', chords:'Am F C E', tempo:'90' } };
  const text = saveProject(state);
  const post = (body = text, headers = {}) => fetch(base + '/api/projects', { method:'POST', headers:{ 'Content-Type':'application/json', ...headers }, body });
  assert.deepEqual(await (await fetch(base + '/api/projects')).json(), { projects:[] });
  const first = await post(); assert.equal(first.status, 201); const saved = await first.json();
  assert.equal(saved.path, `data/${saved.name}`);
  const stored = await fs.readFile(path.join(root, saved.path), 'utf8'); assert.deepEqual(openProject(stored), state);
  const second = await (await post()).json(); assert.notEqual(saved.name, second.name);
  assert.equal((await (await fetch(base + '/api/projects')).json()).projects.length, 2);
  const response = await fetch(base + '/api/projects/' + encodeURIComponent(saved.name));
  assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store');
  const reopened = openProject(await response.text()); assert.deepEqual(midiBytes(reopened.song), midiBytes(state.song));
  assert.equal((await post('{}')).status, 400);
  assert.equal((await post(text, { Origin:'https://example.com' })).status, 403);
  assert.equal((await post(text, { 'Content-Type':'text/plain' })).status, 415);
  assert.equal((await post('x'.repeat(MAX_PROJECT_BYTES + 1))).status, 413);
  assert.equal((await fetch(base + '/api/projects/' + encodeURIComponent('../outside.json'))).status, 400);
  await fs.writeFile(path.join(root, 'outside.json'), text);
  await fs.symlink('../outside.json', path.join(root, 'data', 'link.json'));
  assert.equal((await fetch(base + '/api/projects/link.json')).status, 404);
  assert.equal((await (await fetch(base + '/api/projects')).json()).projects.length, 2);
  assert.equal((await fetch(base + '/data/link.json')).status, 404);
  assert.equal((await fetch(base + '/.git/config')).status, 404);
  assert.equal((await fetch(base + '/')).status, 200);
  const foreignHostStatus = await new Promise((resolve, reject) => {
    http.get(base + '/', { headers:{ Host:'example.com:8000' } }, res => { res.resume(); resolve(res.statusCode); }).on('error', reject);
  });
  assert.equal(foreignHostStatus, 403);
  assert.equal(await fs.readFile(path.join(root, saved.path), 'utf8'), stored);
});

test('refinement API validates sources, limits concurrent work and returns usable revisions', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'composer-refine-'));
  let release, entered;
  const started = new Promise(resolve => { entered = resolve; });
  const waiting = new Promise(resolve => { release = resolve; });
  const server = await createComposerServer(root, {
    status:async () => ({ model:'test-local', ready:true, message:'Ready' }),
    refiner:async piece => {
      entered(); await waiting;
      const c = buildEditCatalog(piece);
      const response = decodeModelChoices({ pitchRevision:{ summary:'Pitch option', editIds:[c.pitch[0].id] }, lengthRevision:{ summary:'Length option', editIds:[c.length[0].id] } }, c);
      return { model:'test-local', revisions:validateRevisions(piece, response) };
    }
  });
  t.after(async () => { release(); if (server.listening) await new Promise(resolve => server.close(resolve)); await fs.rm(root, { recursive:true, force:true }); });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const base = `http://127.0.0.1:${server.address().port}`, piece = compose({ seed:42 });
  const request = value => fetch(base + '/api/refine', { method:'POST', headers:{ 'Content-Type':'application/json' }, body:JSON.stringify(value) });
  assert.equal((await (await fetch(base + '/api/model')).json()).ready, true);
  assert.equal((await request({ piece:{} })).status, 400);
  const first = request({ piece }); await started;
  assert.equal((await request({ piece })).status, 409);
  release(); const response = await first;
  assert.equal(response.status, 200);
  const result = await response.json(); assert.equal(result.revisions.length, 2);
  assert.deepEqual(result.revisions[0].melody[0], piece.melody[0]);
  assert.equal((await request({ piece })).status, 200, 'the busy flag must clear after completion');
  assert.equal((await fetch(base + '/local-model.js')).status, 404, 'server-only model code is not a browser asset');
});
