import test from 'node:test';
import assert from 'node:assert/strict';
import { compose, midiBytes } from './composer.js';
import { arrange } from './arrangement.js';
import { chordChoices, changeChord } from './chord-edit.js';

test('offers a small set of distinct alternatives, with sevenths and modal colour', () => {
  const sharpIdea = arrange(compose({ key:'F#', chords:'F# B C#' }));
  assert.ok(chordChoices(sharpIdea, 1, 0).every(choice => choice.label !== 'Keep it simple'));
  for (const scale of ['major', 'minor']) {
    const song = arrange(compose({ scale }));
    for (let s = 0; s < song.sections.length; s++) for (let e = 0; e < song.sections[s].events.length; e++) {
      const options = chordChoices(song, s, e);
      assert.ok(options.length >= 1 && options.length <= 3);
      assert.equal(new Set(options.map(o => o.chord.name)).size, options.length);
      assert.ok(options.every(o => o.chord.name !== song.sections[s].events[e].chord.name));
    }
    const options = chordChoices(song, 0, 0);
    assert.equal(options.find(o => o.label === 'Add warmth').chord.tones.length, 4);
    assert.equal(options.find(o => o.label === 'Add contrast').chord.tones.length, 3);
  }
});

test('edits are immutable and affect only the chosen chord interval, including half-bars', () => {
  for (const level of ['simple', 'intermediate', 'rich']) {
    const song = arrange(compose({ seed:19 }), { level });
    for (let s = 0; s < song.sections.length; s++) for (let e = 0; e < song.sections[s].events.length; e++) {
      const snapshot = structuredClone(song), section = song.sections[s], event = section.events[e];
      const choice = chordChoices(song, s, e).at(-1), next = changeChord(song, s, e, choice);
      assert.deepEqual(song, snapshot);
      assert.equal(next.sections[s].events[e].chord.name, choice.chord.name);
      for (let other = 0; other < song.sections.length; other++) if (s !== other) assert.deepEqual(next.sections[other], song.sections[other]);
      section.events.forEach((v, i) => { if (i !== e) assert.deepEqual(next.sections[s].events[i], v); });
      const end = event.start + event.duration;
      const outside = notes => notes.filter(n => n.start < event.start || n.start >= end);
      assert.deepEqual(outside(next.sections[s].melody), outside(section.melody));
      assert.deepEqual(outside(next.sections[s].harmony), outside(section.harmony));
      for (const n of next.sections[s].melody.filter(n => n.start >= event.start && n.start < end)) assert.ok(choice.chord.tones.includes(n.pitch % 12));
      assert.equal(next.sections[s].melody.reduce((v, n) => v + n.duration, 0), section.melody.reduce((v, n) => v + n.duration, 0));
      assert.deepEqual(next.melody, next.sections.flatMap(sec => sec.melody.map(n => ({ ...n, start:n.start + sec.start }))));
      assert.deepEqual(next.harmony, next.sections.flatMap(sec => sec.harmony.map(n => ({ ...n, start:n.start + sec.start }))));
      assert.notDeepEqual(midiBytes(next), midiBytes(song));
    }
  }
});

test('consecutive edits preserve earlier choices and snapshots support exact undo', () => {
  const original = arrange(compose({ seed:42 }));
  const first = changeChord(original, 1, 2, chordChoices(original, 1, 2)[0]);
  const second = changeChord(first, 2, 3, chordChoices(first, 2, 3)[0]);
  assert.deepEqual(second.sections[1], first.sections[1]);
  const history = [original, first];
  assert.deepEqual(midiBytes(history.pop()), midiBytes(first));
  assert.deepEqual(midiBytes(history.pop()), midiBytes(original));
});

test('a sustained note is split at the edited interval and keeps its outside pitches', () => {
  const song = arrange(compose(), { level:'rich' });
  song.sections[1].melody = [{ pitch:73, start:17, duration:4, velocity:80 }];
  const e = song.sections[1].events.findIndex(e => e.start === 18);
  const choice = chordChoices(song, 1, e).at(-1), next = changeChord(song, 1, e, choice);
  assert.deepEqual(next.sections[1].melody.map(n => [n.start, n.duration]), [[17, 1], [18, 2], [20, 1]]);
  assert.equal(next.sections[1].melody[0].pitch, 73);
  assert.equal(next.sections[1].melody[2].pitch, 73);
  assert.ok(choice.chord.tones.includes(next.sections[1].melody[1].pitch % 12));
});
