import test from 'node:test';
import assert from 'node:assert/strict';
import { compose, parseChords, midiBytes, ROOTS } from './composer.js';

test('chord sketches support separators, accidentals and supported qualities', () => {
  assert.deepEqual(parseChords('Am → F | C -> E').map(c => c.name), ['Am', 'F', 'C', 'E']);
  assert.deepEqual(parseChords('Bbmaj7 F#m7 Gdim C7')[0].tones, [10, 2, 5, 9]);
  for (const value of ['', 'Am nonsense', 'H', 'C C C C C C C C C']) assert.throws(() => parseChords(value));
});

test('all keys produce bounded, reproducible eight-bar monophonic melodies', () => {
  for (const key of Object.keys(ROOTS)) for (const scale of ['major', 'minor']) for (const seed of [1, 77, 4294967295]) {
    const options = { key, scale, chords:'Am F C E', tempo:90, seed };
    const piece = compose(options);
    assert.deepEqual(piece, compose(options));
    assert.equal(piece.melody.at(-1).pitch % 12, ROOTS[key]);
    let end = 0;
    for (const note of piece.melody) {
      assert.ok(note.start >= end - 1e-9);
      assert.ok(note.duration > 0 && note.start + note.duration <= 32);
      assert.ok(note.pitch >= 60 && note.pitch <= 84);
      if (note.start % 4 === 0) assert.ok(piece.progression[Math.floor(note.start / 4) % 4].tones.includes(note.pitch % 12));
      end = note.start + note.duration;
    }
    for (let bar = 0; bar < 8; bar++) assert.equal(piece.melody.filter(n => Math.floor(n.start / 4) === bar).reduce((sum, n) => sum + n.duration / .9, 0), 4);
  }
  assert.notDeepEqual(compose({ seed:1 }).melody, compose({ seed:2 }).melody);
  assert.throws(() => compose({ tempo:0 }));
  assert.throws(() => compose({ key:'H' }));
});

// Decode the exported binary independently to check event timing and note pairs.
test('MIDI has three valid tracks, tempo, 4/4, correct notes and eight-bar endings', () => {
  const piece = compose({ tempo:120, chords:'Dm7 G7 Cmaj7 Cmaj7', seed:42 });
  const bytes = midiBytes(piece), view = new DataView(bytes.buffer);
  const text = (offset, count) => String.fromCharCode(...bytes.slice(offset, offset + count));
  assert.equal(text(0, 4), 'MThd'); assert.equal(view.getUint32(4), 6);
  assert.equal(view.getUint16(8), 1); assert.equal(view.getUint16(10), 3); assert.equal(view.getUint16(12), 480);
  let pos = 14;
  for (let track = 0; track < 3; track++) {
    assert.equal(text(pos, 4), 'MTrk'); const end = pos + 8 + view.getUint32(pos + 4); pos += 8;
    const vlq = () => { let n = 0, b; do { b = bytes[pos++]; n = (n << 7) | (b & 127); } while (b & 128); return n; };
    let tick = 0, ended = false; const active = new Map(), decoded = [];
    while (pos < end) {
      tick += vlq(); const status = bytes[pos++];
      if (status === 0xff) {
        const type = bytes[pos++], length = vlq();
        if (type === 0x51) assert.deepEqual([...bytes.slice(pos, pos + length)], [7, 161, 32]);
        if (type === 0x58) assert.deepEqual([...bytes.slice(pos, pos + length)], [4, 2, 24, 8]);
        if (type === 0x2f) { ended = true; assert.equal(tick, 32 * 480); }
        pos += length;
      } else if ((status & 0xf0) === 0xc0) pos++;
      else {
        const pitch = bytes[pos++], velocity = bytes[pos++];
        if ((status & 0xf0) === 0x90) { assert.ok(!active.has(pitch)); active.set(pitch, { tick, velocity }); }
        else { assert.equal(status & 0xf0, 0x80); assert.ok(active.has(pitch)); const start = active.get(pitch); decoded.push({ pitch, start:start.tick, duration:tick - start.tick, velocity:start.velocity }); active.delete(pitch); }
      }
    }
    assert.equal(pos, end); assert.ok(ended); assert.equal(active.size, 0);
    if (track > 0) {
      const expected = (track === 1 ? piece.melody : piece.harmony).map(n => ({ ...n, start:Math.round(n.start * 480), duration:Math.round((n.start + n.duration) * 480) - Math.round(n.start * 480) }));
      const order = (a, b) => a.start - b.start || a.pitch - b.pitch;
      assert.deepEqual(decoded.sort(order), expected.sort(order));
    }
  }
  assert.equal(pos, bytes.length);
});
