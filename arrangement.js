import { ROOTS, parseChords } from './composer.js';

const SHARPS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLATS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const mod = n => (n % 12 + 12) % 12;
const nearest = (target, tones, low = 60, high = 96) => {
  const pitches = Array.from({ length:high - low + 1 }, (_, i) => low + i).filter(p => tones.includes(p % 12));
  return pitches.sort((a, b) => Math.abs(a - target) - Math.abs(b - target) || a - b)[0];
};

export function arrange(idea, { rich:legacyRich, level = legacyRich === undefined ? 'intermediate' : legacyRich ? 'rich' : 'simple' } = {}) {
  if (!['simple', 'intermediate', 'rich'].includes(level)) throw new Error('Choose simple, intermediate or rich harmony.');
  const rich = level === 'rich', intermediate = level === 'intermediate';
  const minor = idea.scale === 'minor', tonic = ROOTS[idea.key];
  const names = idea.key.includes('b') || ['F', 'D', 'G', 'C'].includes(idea.key) && minor ? FLATS : SHARPS;
  const chord = (offset, quality = '') => parseChords(names[mod(tonic + offset)] + quality)[0];
  const I = chord(0, minor ? 'm' : ''), V = chord(7, intermediate ? '' : '7');
  const ii = intermediate ? chord(minor ? 5 : 2, 'm') : chord(2, minor ? 'dim' : 'm7');
  const extend = c => {
    if (!rich || c.tones.length !== 3 || c.tones.includes(mod(c.root + 6))) return c;
    return parseChords(c.name + (c.tones.includes(mod(c.root + 3)) || c.root === mod(tonic + 7) ? '7' : 'maj7'))[0];
  };
  const borrowed = minor ? chord(5, '7') : chord(5, 'm7');
  const modalReason = minor ? 'Dorian IV7: the raised sixth brightens the minor key.' : 'Borrowed ivm7 from the parallel minor adds a darker colour.';
  const source = Array.from({ length:8 }, (_, i) => idea.progression[i % idea.progression.length]);
  const sections = [
    { name:'Intro', bars:4, chords:[I, rich ? borrowed : chord(5, minor ? 'm' : ''), ii, V], description:'A short invitation, ending on the dominant to lead into the verse.' },
    { name:'Verse 1', bars:8, chords:[...source.slice(0, 7), V], description:'Your selected idea keeps its rhythm and melodic outline under the new harmony.' },
    { name:'Chorus', bars:8, chords:minor
      ? [chord(8), chord(3), chord(10), I, rich ? borrowed : chord(5, 'm'), chord(5, 'm'), V, I]
      : [chord(5), chord(7), chord(4, 'm'), chord(9, 'm'), rich ? borrowed : chord(5), I, V, I], description:'A higher melody and a new harmonic route give the chorus more lift.' },
    { name:'Verse 2', bars:8, chords:[...source.slice(0, 7), I], description:'The verse returns with its motif and a settled tonic ending.' },
    { name:'Ending', bars:4, chords:[chord(5, minor ? 'm' : ''), ii, V, I], description:'A dominant-to-tonic cadence closes the song with a held melody note.' }
  ];
  let offset = 0;
  for (const section of sections) {
    section.start = offset;
    section.events = section.chords.map((c, bar) => ({ chord:extend(c), start:bar * 4, duration:4, technique:rich && extend(c).name !== c.name ? 'Seventh' : '', explanation:rich && extend(c).name !== c.name ? 'A seventh adds colour to the underlying triad.' : '' }));
    const replace = (index, c, technique, explanation) => Object.assign(section.events[index], { chord:c, technique, explanation });
    if (intermediate) {
      if (section.name === 'Intro' || section.name === 'Ending') {
        const index = section.name === 'Intro' ? 3 : 2;
        replace(index, chord(7, '7'), 'Seventh', 'A single dominant seventh adds a gentle pull toward the next section or final tonic.');
      }
      if (section.name === 'Chorus') {
        replace(4, chord(5, minor ? '' : 'm'), 'Modal colour', minor
          ? 'A major IV borrowed from Dorian briefly brightens the minor chorus.'
          : 'A minor iv borrowed from the parallel minor adds a brief darker colour.');
      }
    }
    if (rich) {
      if (section.name === 'Intro') replace(1, borrowed, 'Modal colour', modalReason);
      if (section.name === 'Chorus') replace(4, borrowed, 'Modal colour', modalReason);
      if (section.name.startsWith('Verse')) {
        // Preserve the user's destination chord; put its own dominant before it.
        const targetIndex = section.events.findIndex((e, i) => i >= 2 && i <= 3 && e.chord.root !== tonic && !e.chord.tones.includes(mod(e.chord.root + 6)));
        if (targetIndex > 0) {
          const target = section.events[targetIndex].chord;
          const dominant = parseChords(names[mod(target.root + 7)] + '7')[0];
          replace(targetIndex - 1, dominant, 'Secondary dominant', `${dominant.name} is V7 of ${target.name}; it resolves directly into that chord.`);
        } else {
          // A tonic-only sketch still gets a genuine secondary dominant, V7/iv or V7/ii.
          const target = minor ? chord(5, 'm7') : chord(2, 'm7');
          const dominant = parseChords(names[mod(target.root + 7)] + '7')[0];
          replace(1, dominant, 'Secondary dominant', `${dominant.name} is V7 of ${target.name}; it resolves directly into that chord.`);
          replace(2, target, 'Resolution', `Destination of ${dominant.name}.`);
        }
        const next = section.events[5].chord;
        const diminished = parseChords(names[mod(next.root - 1)] + 'dim')[0];
        section.events[4].duration = 2;
        section.events.push({ start:18, duration:2, chord:diminished, technique:'Diminished approach', explanation:`${diminished.name} approaches ${next.name} with a root a semitone below.` });
        const destination = section.events[7].chord;
        const passing = parseChords(names[mod(destination.root - 1)])[0];
        section.events[6].duration = 2;
        section.events.push({ start:26, duration:2, chord:passing, technique:'Chromatic passing chord', explanation:`A brief ${passing.name} moves up a semitone into ${destination.name}.` });
      }
    }
    section.events.sort((a, b) => a.start - b.start);
    section.progression = section.chords;
    section.beats = section.bars * 4;
    section.key = idea.key; section.scale = idea.scale; section.tempo = idea.tempo; section.seed = idea.seed;
    section.melody = []; section.harmony = [];
    for (const e of section.events) {
      e.chord.tones.forEach((pc, i) => {
        let pitch = 48 + pc;
        if (i && pc < e.chord.root) pitch += 12;
        section.harmony.push({ pitch, start:e.start, duration:e.duration - .12, velocity:section.name === 'Chorus' ? 62 : 50 });
      });
    }
    const scalePcs = (minor ? [0, 2, 3, 5, 7, 8, 10] : [0, 2, 4, 5, 7, 9, 11]).map(n => mod(n + tonic));
    const original = idea.melody.filter(n => n.start < section.beats);
    for (const n of original) {
      // Split sustained melody notes when a passing chord starts underneath them.
      const end = Math.min(n.start + n.duration, section.beats);
      const boundaries = [n.start, ...section.events.map(e => e.start).filter(t => t > n.start && t < end), end];
      for (let i = 0; i < boundaries.length - 1; i++) {
        const start = boundaries[i], duration = boundaries[i + 1] - start;
        const event = section.events.find(e => start >= e.start && start < e.start + e.duration);
        const altered = event.chord.tones.some(pc => !scalePcs.includes(pc));
        const anchor = start === event.start || start % 2 === 0 || duration >= 1;
        const featuredHarmony = event.technique && event.technique !== 'Seventh';
        const allowed = altered || anchor || featuredHarmony ? event.chord.tones : [...new Set([...scalePcs, ...event.chord.tones])];
        const target = n.pitch + (section.name === 'Chorus' ? 12 : 0);
        const pitch = nearest(target, allowed);
        section.melody.push({ pitch, start, duration, velocity:section.name === 'Chorus' ? 94 : n.velocity });
      }
    }
    if (section.name === 'Ending') {
      section.melody = section.melody.filter(n => n.start < section.beats - 4);
      const previous = section.melody.at(-1)?.pitch || 72;
      section.melody.push({ pitch:nearest(previous, [tonic]), start:section.beats - 4, duration:3.8, velocity:78 });
    }
    section.adaptedNotes = section.melody.filter(n => {
      const sourceNote = original.find(s => n.start >= s.start && n.start < s.start + s.duration);
      return !sourceNote || sourceNote.pitch !== n.pitch;
    }).length;
    offset += section.beats;
  }
  return {
    ...idea, rich, level, sections, bars:offset / 4, beats:offset,
    melody:sections.flatMap(s => s.melody.map(n => ({ ...n, start:n.start + s.start }))),
    harmony:sections.flatMap(s => s.harmony.map(n => ({ ...n, start:n.start + s.start })))
  };
}
