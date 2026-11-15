import test from 'node:test';
import assert from 'node:assert/strict';
import { compose, ROOTS } from './composer.js';
import { SCALES, matchingChords } from './scales.js';
import { arrange } from './arrangement.js';

test('a two-bar rhythm returns with breathing spaces and a longer final answer', () => {
  for (let seed = 1; seed <= 60; seed++) {
    const piece = compose({ key:'C', scale:'major', chords:'C', seed });
    const rhythm = bar => piece.melody.filter(n => Math.floor(n.start / 4) === bar).map(n => [n.start % 4, n.duration]);
    assert.deepEqual(rhythm(0), rhythm(2));
    assert.deepEqual(rhythm(0), rhythm(4));
    assert.deepEqual(rhythm(1), rhythm(3));
    assert.ok(piece.melody.some((n, i, all) => i && n.start - (all[i - 1].start + all[i - 1].duration) >= .5));
    for (const start of [8, 16, 24]) {
      const previous = piece.melody.filter(n => n.start < start).at(-1);
      assert.ok(start - previous.start - previous.duration >= .5);
    }
    const questionEnd = piece.melody.filter(n => n.start < 8).at(-1);
    assert.notEqual(questionEnd.pitch % 12, 0);
    assert.equal(piece.melody.at(-1).pitch % 12, 0);
    assert.ok(piece.melody.at(-1).duration >= 1.8);
    assert.ok(piece.melody.at(-1).duration > questionEnd.duration);
    assert.ok(new Set(piece.melody.map(n => n.velocity)).size >= 3);
  }
});

test('phrases limit leaps across matching keys/scales and preserve rests in arrangements', () => {
  for (const key of Object.keys(ROOTS)) for (const scale of Object.keys(SCALES)) for (const seed of [1, 19, 42]) {
    const piece = compose({ key, scale, seed, chords:matchingChords(ROOTS[key], scale) });
    for (let i = 1; i < piece.melody.length; i++) assert.ok(Math.abs(piece.melody[i].pitch - piece.melody[i - 1].pitch) <= 7);
    const first = piece.melody.filter(n => n.start < 8), development = piece.melody.filter(n => n.start >= 16 && n.start < 24);
    const mean = notes => notes.reduce((sum, n) => sum + n.pitch, 0) / notes.length;
    assert.ok(mean(development) >= mean(first));
    const song = arrange(piece);
    // Chord fitting must not fill the written rests in the returning verse.
    const verse = song.sections[1];
    for (let i = 1; i < piece.melody.length; i++) {
      const restStart = piece.melody[i - 1].start + piece.melody[i - 1].duration, restEnd = piece.melody[i].start;
      if (restEnd - restStart >= .5) assert.ok(verse.melody.every(n => n.start >= restEnd || n.start + n.duration <= restStart + 1e-9));
    }
  }
});

test('an open last chord ends on a fitting note; a home chord resolves to the tonic', () => {
  for (const seed of [1, 19, 42]) {
    const open = compose({ key:'A', scale:'minor', chords:'Am F C E', seed });
    assert.equal(open.ending, 'open');
    assert.ok([4, 8, 11].includes(open.melody.at(-1).pitch % 12));
    const resolved = compose({ key:'A', scale:'minor', chords:'Am F C Am', seed });
    assert.equal(resolved.ending, 'resolved'); assert.equal(resolved.melody.at(-1).pitch % 12, 9);
  }
});
