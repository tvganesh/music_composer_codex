import { ROOTS, parseChords } from './composer.js?v=0.5.0';
import { isMinorScale, scaleChord, scalePitches, scaleSeventh, modalColour } from './scales.js?v=0.5.0';

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
  const minor = isMinorScale(idea.scale), tonic = ROOTS[idea.key];
  const modal = !['major', 'minor'].includes(idea.scale);
  const useScaleHarmony = modal || level === 'simple';
  const degree = n => scaleChord(tonic, idea.scale, n);
  const names = idea.key.includes('b') || ['F', 'D', 'G', 'C'].includes(idea.key) && minor ? FLATS : SHARPS;
  const chord = (offset, quality = '') => parseChords(names[mod(tonic + offset)] + quality)[0];
  const I = useScaleHarmony ? degree(0) : chord(0, minor ? 'm' : ''), V = useScaleHarmony ? degree(4) : chord(7, intermediate ? '' : '7');
  const ii = useScaleHarmony ? degree(1) : intermediate ? chord(minor ? 5 : 2, 'm') : chord(2, minor ? 'dim' : 'm7');
  const extend = c => {
    if (modal) return rich ? scaleSeventh(c, tonic, idea.scale) : c;
    if (!rich || c.tones.length !== 3 || c.tones.includes(mod(c.root + 6))) return c;
    return parseChords(c.name + (c.tones.includes(mod(c.root + 3)) || c.root === mod(tonic + 7) ? '7' : 'maj7'))[0];
  };
  const borrowed = modalColour(tonic, idea.scale, true);
  const modalReason = borrowed.explanation;
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
  if (useScaleHarmony) {
    sections[0].chords = [I, degree(3), ii, V];
    sections[1].chords = [...source.slice(0, 7), V];
    sections[2].chords = [3, 4, 1, 5, 3, 0, 4, 0].map(degree);
    sections[3].chords = [...source.slice(0, 7), I];
    sections[4].chords = [degree(3), ii, V, I];
    sections[0].description = 'A short introduction using chords from your chosen scale or mode.';
    sections[2].description = 'A higher melody explores a new route through your chosen scale or mode.';
    sections[4].description = 'The harmony returns to the home chord, with a held home note.';
  }
  let offset = 0;
  for (const section of sections) {
    section.start = offset;
    section.events = section.chords.map((c, bar) => ({ chord:extend(c), start:bar * 4, duration:4, technique:rich && extend(c).name !== c.name ? 'Seventh' : '', explanation:rich && extend(c).name !== c.name ? 'A seventh adds colour to the underlying triad.' : '' }));
    const replace = (index, c, technique, explanation) => Object.assign(section.events[index], { chord:c, technique, explanation });
    if (intermediate) {
      if (section.name === 'Intro' || section.name === 'Ending') {
        const index = section.name === 'Intro' ? 3 : 2;
        const colourSeventh = modal
          ? [4, 3, 1, 0, 5, 6, 2].map(n => scaleChord(tonic, idea.scale, n, true)).find(c => c.tones.length === 4)
          : chord(7, '7');
        replace(index, colourSeventh, 'Seventh', modal ? 'A seventh drawn from the chosen scale adds a little colour.' : 'A single dominant seventh adds a gentle pull toward the next section or final tonic.');
      }
      if (section.name === 'Chorus') {
        const contrast = modalColour(tonic, idea.scale);
        replace(4, contrast, 'Modal colour', contrast.explanation);
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
    const scalePcs = scalePitches(tonic, idea.scale);
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
        const bluesAnchors = event.chord.tones.filter(pc => scalePcs.includes(pc));
        const allowed = idea.scale === 'blues'
          ? (anchor && bluesAnchors.length ? bluesAnchors : scalePcs)
          : altered || anchor || featuredHarmony ? event.chord.tones : [...new Set([...scalePcs, ...event.chord.tones])];
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
