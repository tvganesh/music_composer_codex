import { ROOTS, parseChords } from './composer.js?v=0.6.1';
import { scaleInfo } from './scales.js?v=0.6.1';

export const MAX_PROJECT_BYTES = 2 * 1024 * 1024;
const levels = ['simple', 'intermediate', 'rich'];
const sectionNames = ['Intro', 'Verse 1', 'Chorus', 'Verse 2', 'Ending'];
const inputKeys = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
function check(condition, message) { if (!condition) throw new Error(message); }
const number = n => typeof n === 'number' && Number.isFinite(n);
const integer = (n, min, max) => Number.isInteger(n) && n >= min && n <= max;
const string = (s, max = 2000) => typeof s === 'string' && s.length <= max;
const list = (v, min, max) => Array.isArray(v) && v.length >= min && v.length <= max;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function chord(c) {
  check(c && string(c.name, 16), 'Invalid chord in project.');
  const parsed = parseChords(c.name);
  check(parsed.length === 1 && parsed[0].root === c.root && same(parsed[0].tones, c.tones), 'Chord notes do not match the chord name.');
}
function notes(values, beats, monophonic) {
  check(list(values, 1, 4096), 'Missing or oversized note track.');
  let end = 0;
  for (const n of values) {
    check(n && integer(n.pitch, 0, 127) && integer(n.velocity, 1, 127) && number(n.start) && number(n.duration)
      && n.start >= 0 && n.duration > 0 && n.start + n.duration <= beats + 1e-8, 'Invalid note pitch, timing or velocity.');
    if (monophonic) check(n.start >= end - 1e-8, 'Melody notes overlap or are out of order.');
    end = n.start + n.duration;
  }
}
function piece(p, bars) {
  check(p && Object.hasOwn(ROOTS, p.key), 'Invalid project key.');
  scaleInfo(p.scale);
  check(p.bars === bars && p.beats === bars * 4, 'Unsupported section length.');
  check(number(p.tempo) && p.tempo >= 40 && p.tempo <= 200 && integer(p.seed, 0, 4294967295), 'Invalid tempo or seed.');
  check(list(p.progression, 1, 8), 'Invalid chord progression.'); p.progression.forEach(chord);
  notes(p.melody, p.beats, true); notes(p.harmony, p.beats, false);
  if (p.ending !== undefined) check(['open', 'resolved'].includes(p.ending), 'Invalid phrase ending.');
  if (p.phrases !== undefined) {
    check(list(p.phrases, 1, 4), 'Invalid phrase labels.');
    for (const phrase of p.phrases) check(phrase && string(phrase.role, 40) && number(phrase.start) && number(phrase.beats)
      && phrase.start >= 0 && phrase.beats > 0 && phrase.start + phrase.beats <= 32, 'Invalid phrase label.');
  }
}
function validate(doc) {
  check(doc && doc.format === 'sketch-composer-project', 'Choose a Sketch Composer project file, not a MIDI file.');
  check(doc.version === 1, 'This project version is not supported by this app.');
  const s = doc.state;
  check(s && list(s.ideas, 3, 3) && integer(s.selected, 0, 2), 'Project must contain three ideas and a valid selection.');
  s.ideas.forEach(p => piece(p, 8));
  check(levels.includes(s.harmony) && typeof s.accompaniment === 'boolean', 'Invalid playback or harmony setting.');
  check(s.inputs && inputKeys.includes(s.inputs.key), 'Invalid sketch settings.'); scaleInfo(s.inputs.scale);
  // Preserve unsubmitted input text too, including temporarily empty fields.
  check(string(s.inputs.chords, 256) && string(s.inputs.tempo, 16), 'Invalid sketch input text.');
  check(s.song === null || typeof s.song === 'object', 'Invalid arrangement.');
  if (s.song !== null) {
    const song = s.song, idea = s.ideas[s.selected];
    piece(song, 32);
    check(levels.includes(song.level) && song.rich === (song.level === 'rich'), 'Invalid arrangement harmony.');
    for (const field of ['key', 'scale', 'tempo', 'seed']) check(song[field] === idea[field], 'Arrangement does not match its selected idea.');
    check(same(song.progression, idea.progression), 'Arrangement does not match its original chord sketch.');
    check(list(song.sections, 5, 5), 'Project must contain the five song sections.');
    let start = 0;
    song.sections.forEach((section, i) => {
      const bars = i === 0 || i === 4 ? 4 : 8;
      piece(section, bars);
      check(section.name === sectionNames[i] && section.start === start && string(section.description)
        && integer(section.adaptedNotes, 0, 4096) && (section.edited === undefined || typeof section.edited === 'boolean'), 'Invalid song section.');
      for (const field of ['key', 'scale', 'tempo', 'seed']) check(section[field] === song[field], 'Section settings do not match the song.');
      check(list(section.chords, bars, bars), 'Invalid section chords.'); section.chords.forEach(chord);
      check(list(section.events, bars, bars * 2), 'Invalid chord events.');
      let beat = 0;
      for (const e of section.events) {
        check(e && e.start === beat && number(e.duration) && e.duration > 0 && string(e.technique, 100) && string(e.explanation), 'Invalid chord event timing or description.');
        chord(e.chord); beat += e.duration;
      }
      check(beat === section.beats, 'Chord events do not cover the section.'); start += section.beats;
    });
    for (const track of ['melody', 'harmony']) {
      const combined = song.sections.flatMap(section => section[track].map(n => ({ ...n, start:n.start + section.start })));
      check(same(song[track], combined), 'Song tracks do not match their sections.');
    }
  }
  check(integer(s.sectionIndex, -1, s.song ? 4 : -1), 'Invalid selected section.');
  return structuredClone({ ideas:s.ideas, selected:s.selected, song:s.song, sectionIndex:s.sectionIndex,
    inputs:s.inputs, harmony:s.harmony, accompaniment:s.accompaniment });
}

export function saveProject(state) {
  const doc = { format:'sketch-composer-project', version:1, appVersion:'0.6.1', state };
  validate(doc);
  const text = JSON.stringify(doc, null, 2) + '\n';
  check(new TextEncoder().encode(text).length <= MAX_PROJECT_BYTES, 'Project file is too large.');
  return text;
}
export function openProject(text) {
  check(typeof text === 'string' && new TextEncoder().encode(text).length <= MAX_PROJECT_BYTES, 'Project files must be smaller than 2 MB.');
  let doc;
  try { doc = JSON.parse(text); } catch { throw new Error('This file is not valid project JSON.'); }
  return validate(doc);
}
