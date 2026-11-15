import test from 'node:test';
import assert from 'node:assert/strict';
import { compose, midiBytes } from './composer.js';
import { arrange } from './arrangement.js';
import { chordChoices, changeChord } from './chord-edit.js';
import { SCALES, matchingChords } from './scales.js';
import { saveProject, openProject, MAX_PROJECT_BYTES } from './project.js';

function workspace(scale = 'minor', level = 'intermediate', withSong = true) {
  const ideas = [1, 19, 42].map(seed => compose({ scale, key:'A', chords:matchingChords(9, scale), seed }));
  return { ideas, selected:1, song:withSong ? arrange(ideas[1], { level }) : null, sectionIndex:withSong ? 2 : -1,
    inputs:{ key:'A', scale, chords:matchingChords(9, scale), tempo:'90' }, harmony:level, accompaniment:true };
}

test('project round trip restores every idea and an unarranged workspace exactly', () => {
  const original = workspace('major', 'simple', false), before = structuredClone(original);
  const restored = openProject(saveProject(original));
  assert.deepEqual(original, before); assert.deepEqual(restored, original);
  original.ideas.forEach((idea, i) => assert.deepEqual(midiBytes(restored.ideas[i]), midiBytes(idea)));
  restored.ideas[0].melody[0].pitch++;
  assert.deepEqual(original, before, 'restored state must be an independent copy');
});

test('all scale and harmony settings restore edited song and section MIDI without regeneration', () => {
  for (const scale of Object.keys(SCALES)) for (const level of ['simple', 'intermediate', 'rich']) {
    const original = workspace(scale, level);
    original.song = changeChord(original.song, 1, 2, chordChoices(original.song, 1, 2)[0]);
    original.song = changeChord(original.song, 2, 3, chordChoices(original.song, 2, 3).at(-1));
    const restored = openProject(saveProject(original));
    assert.deepEqual(restored, original);
    assert.deepEqual(midiBytes(restored.song), midiBytes(original.song));
    restored.song.sections.forEach((section, i) => assert.deepEqual(midiBytes(section), midiBytes(original.song.sections[i])));
  }
});

test('unsubmitted sketch fields, original-idea view and playback setting are preserved', () => {
  const original = workspace();
  original.inputs = { key:'F#', scale:'dorian', chords:'not yet valid', tempo:'' };
  original.sectionIndex = -1; original.accompaniment = false;
  assert.deepEqual(openProject(saveProject(original)), original);
});

test('invalid or unsupported files are rejected without changing the source workspace', () => {
  const original = workspace(), before = structuredClone(original), text = saveProject(original);
  assert.throws(() => openProject('{unfinished'), /valid project JSON/);
  assert.throws(() => openProject('MThd'), /valid project JSON/);
  assert.throws(() => openProject('{}'), /Sketch Composer project/);
  const mutations = [
    d => d.version = 99,
    d => d.state.selected = 3,
    d => d.state.sectionIndex = 5,
    d => d.state.ideas[0].melody[0].pitch = 128,
    d => d.state.ideas[0].melody[0].duration = -1,
    d => d.state.ideas[0].scale = 'constructor',
    d => d.state.inputs.key = 'C#',
    d => d.state.ideas[0].progression[0].tones = [1, 2, 3],
    d => d.state.song.sections[1].events[0].start = 1,
    d => d.state.song.sections[1].description = {},
    d => d.state.song.sections.pop(),
    d => d.state.song.melody[0].pitch++,
    d => d.state.song.seed = 999,
    d => d.state.song = null
  ];
  for (const mutate of mutations) {
    const doc = JSON.parse(text); mutate(doc);
    assert.throws(() => openProject(JSON.stringify(doc)));
  }
  assert.deepEqual(original, before);
});

test('oversized projects are rejected before parsing', () => {
  assert.throws(() => openProject(' '.repeat(MAX_PROJECT_BYTES + 1)), /2 MB/);
  assert.throws(() => saveProject({ ...workspace(), selected:-1 }), /valid selection/);
});
