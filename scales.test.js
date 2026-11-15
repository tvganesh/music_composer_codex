import test from 'node:test';
import assert from 'node:assert/strict';
import { compose, ROOTS, parseChords, midiBytes } from './composer.js';
import { arrange } from './arrangement.js';
import { chordChoices, changeChord } from './chord-edit.js';
import { SCALES, scalePitches, matchingChords, scaleChord, modalColour } from './scales.js';

test('known scales and starter harmonies contain the expected notes', () => {
  const fixtures = {
    'harmonic-minor':[0, 2, 3, 5, 7, 8, 11], 'melodic-minor':[0, 2, 3, 5, 7, 9, 11],
    dorian:[0, 2, 3, 5, 7, 9, 10], phrygian:[0, 1, 3, 5, 7, 8, 10],
    lydian:[0, 2, 4, 6, 7, 9, 11], mixolydian:[0, 2, 4, 5, 7, 9, 10], locrian:[0, 1, 3, 5, 6, 8, 10],
    blues:[0, 3, 5, 6, 7, 10], hijaz:[0, 1, 4, 5, 7, 8, 10]
  };
  for (const [scale, pcs] of Object.entries(fixtures)) assert.deepEqual(scalePitches(0, scale), pcs);
  assert.equal(matchingChords(2, 'dorian'), 'Dm G C Dm');
  assert.equal(matchingChords(5, 'lydian'), 'F G C F');
  assert.equal(matchingChords(11, 'locrian'), 'Bdim C Dm Bdim');
  assert.equal(matchingChords(9, 'harmonic-minor'), 'Am Dm E Am');
  assert.equal(matchingChords(9, 'blues'), 'Am Dm Em Am');
  assert.equal(matchingChords(4, 'hijaz'), 'E F Am E');
  assert.deepEqual(parseChords('Caug')[0].tones, [0, 4, 8]);
  assert.throws(() => compose({ scale:'constructor' }));
});

test('every scale creates repeatable phrases in every key, without forcing characteristic notes', () => {
  for (const key of Object.keys(ROOTS)) for (const scale of Object.keys(SCALES)) {
    const pcs = scalePitches(ROOTS[key], scale), chords = matchingChords(ROOTS[key], scale);
    const harmonyPcs = (SCALES[scale].harmonyIntervals || SCALES[scale].intervals).map(n => (ROOTS[key] + n) % 12);
    for (let degree = 0; degree < 7; degree++) {
      for (const seventh of [false, true]) {
        const chord = scaleChord(ROOTS[key], scale, degree, seventh);
        assert.ok(chord.tones.every(pc => harmonyPcs.includes(pc)));
        assert.deepEqual(parseChords(chord.name)[0].tones, chord.tones);
      }
    }
    for (const seed of [1, 77, 4294967295]) {
      const opts = { key, scale, chords, seed }, piece = compose(opts);
      assert.deepEqual(piece, compose(opts));
      let end = 0;
      for (const n of piece.melody) {
        assert.ok(n.start >= end); end = n.start + n.duration;
        assert.ok(n.pitch >= 60 && n.pitch <= 84 && end <= 32 && n.duration > 0);
        assert.ok(pcs.includes(n.pitch % 12));
        if (n.start % 4 === 0 || n.start % 4 === 2) assert.ok(piece.progression[Math.floor(n.start / 4) % 4].tones.includes(n.pitch % 12));
      }
      assert.equal(piece.melody.at(-1).pitch % 12, ROOTS[key]);
      assert.ok(piece.harmony.every(n => harmonyPcs.includes(n.pitch % 12)));
    }
  }
});

test('simple arrangements preserve the selected scale, while all harmony levels and edits export', () => {
  for (const key of ['C', 'F#', 'Bb']) for (const scale of Object.keys(SCALES)) {
    const pcs = scalePitches(ROOTS[key], scale);
    const harmonyPcs = (SCALES[scale].harmonyIntervals || SCALES[scale].intervals).map(n => (ROOTS[key] + n) % 12);
    const idea = compose({ key, scale, chords:matchingChords(ROOTS[key], scale), seed:42 });
    for (const level of ['simple', 'intermediate', 'rich']) {
      const song = arrange(idea, { level });
      assert.equal(song.scale, scale); assert.equal(song.beats, 128);
      if (level === 'simple') {
        assert.ok(song.harmony.every(n => harmonyPcs.includes(n.pitch % 12)));
        assert.ok(song.melody.every(n => pcs.includes(n.pitch % 12)));
      }
      assert.equal(song.melody.at(-1).pitch % 12, ROOTS[key]);
      const choices = chordChoices(song, 2, 0);
      assert.ok(choices.length > 0 && choices.length <= 3);
      const edited = changeChord(song, 2, 0, choices[0]);
      assert.ok(midiBytes(edited).length > 100);
      for (const s of edited.sections) {
        let end = 0;
        for (const n of s.melody) { assert.ok(n.start >= end - 1e-9 && n.duration > 0); end = n.start + n.duration; }
        assert.ok(end <= s.beats);
      }
    }
    // Dorian's contrast must not suggest its own native major IV as a borrowing.
    const contrast = modalColour(ROOTS[key], scale);
    assert.ok(contrast.tones.some(pc => !pcs.includes(pc)));
  }
});

test('minor blues uses blue notes only as short stepwise connections', () => {
  let blueCount = 0, withoutBlue = 0;
  for (const key of Object.keys(ROOTS)) for (let seed = 1; seed <= 30; seed++) {
    const root = ROOTS[key], piece = compose({ key, scale:'blues', chords:matchingChords(root, 'blues'), seed });
    const blues = piece.melody.filter(n => n.pitch % 12 === (root + 6) % 12);
    if (!blues.length) withoutBlue++;
    for (const blue of blues) {
      blueCount++;
      const index = piece.melody.indexOf(blue), before = piece.melody[index - 1], next = piece.melody[index + 1];
      assert.ok(blue.duration < .5); assert.notEqual(blue.start % 2, 0);
      assert.equal(Math.abs(next.pitch - blue.pitch), 1);
      assert.equal(Math.abs(before.pitch - blue.pitch), 1);
      assert.ok(next.start - blue.start <= .5);
    }
    if (seed <= 3) for (const level of ['simple', 'intermediate', 'rich']) {
      const song = arrange(piece, { level });
      assert.ok(song.melody.every(n => scalePitches(root, 'blues').includes(n.pitch % 12)));
    }
  }
  assert.ok(blueCount > 0, 'some natural connections should use the blue note');
  assert.ok(withoutBlue > 0, 'a blue note should not be forced into every phrase');
});
