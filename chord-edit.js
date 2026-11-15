import { ROOTS, parseChords } from './composer.js?v=0.5.0';
import { modalColour } from './scales.js?v=0.5.0';

const names = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const mod = n => (n % 12 + 12) % 12;
const make = (root, suffix = '') => parseChords(names[mod(root)] + suffix)[0];

export function chordChoices(song, sectionIndex, eventIndex) {
  const current = song.sections[sectionIndex]?.events[eventIndex]?.chord;
  if (!current) throw new Error('Choose a chord in a song section.');
  const minor = current.tones.includes(mod(current.root + 3));
  const simple = make(current.root, minor ? 'm' : '');
  const warm = make(current.root, minor ? 'm7' : current.root === mod(ROOTS[song.key] + 7) ? '7' : 'maj7');
  const modal = modalColour(ROOTS[song.key], song.scale);
  const signature = chord => [...chord.tones].sort((a, b) => a - b).join(',');
  return [
    { label:'Keep it simple', chord:simple, explanation:'A straightforward three-note chord on the same root.' },
    { label:'Add warmth', chord:warm, explanation:'A seventh adds a little more colour.' },
    { label:'Add contrast', chord:modal, explanation:modal.explanation }
  ].filter((choice, index, all) => signature(choice.chord) !== signature(current) && all.findIndex(c => signature(c.chord) === signature(choice.chord)) === index);
}

export function changeChord(song, sectionIndex, eventIndex, choice) {
  if (!song.sections[sectionIndex]?.events[eventIndex]) throw new Error('Choose a chord in a song section.');
  const next = structuredClone(song), section = next.sections[sectionIndex], event = section.events[eventIndex];
  const chord = parseChords(choice.chord.name)[0];
  const start = event.start, end = start + event.duration;
  event.chord = chord; event.technique = choice.label; event.explanation = choice.explanation;
  section.edited = true;
  // Keep other chord events and their voicings exactly as they were.
  section.harmony = section.harmony.filter(n => n.start < start || n.start >= end);
  chord.tones.forEach((pc, i) => {
    let pitch = 48 + pc;
    if (i && pc < chord.root) pitch += 12;
    section.harmony.push({ pitch, start, duration:event.duration - .12, velocity:section.name === 'Chorus' ? 62 : 50 });
  });
  section.harmony.sort((a, b) => a.start - b.start);
  const nearest = pitch => Array.from({ length:37 }, (_, i) => 60 + i)
    .filter(p => chord.tones.includes(p % 12))
    .sort((a, b) => Math.abs(a - pitch) - Math.abs(b - pitch) || a - b)[0];
  section.melody = section.melody.flatMap(note => {
    const noteEnd = note.start + note.duration;
    if (noteEnd <= start || note.start >= end) return [note];
    const cuts = [...new Set([note.start, Math.max(start, note.start), Math.min(end, noteEnd), noteEnd])].sort((a, b) => a - b);
    return cuts.slice(0, -1).map((at, i) => ({ ...note, start:at, duration:cuts[i + 1] - at, pitch:at >= start && at < end ? nearest(note.pitch) : note.pitch }));
  });
  // The first event in a bar is also represented in the summary progression.
  if (start % 4 === 0) { section.chords[start / 4] = chord; section.progression[start / 4] = chord; }
  next.melody = next.sections.flatMap(s => s.melody.map(n => ({ ...n, start:n.start + s.start })));
  next.harmony = next.sections.flatMap(s => s.harmony.map(n => ({ ...n, start:n.start + s.start })));
  return next;
}
