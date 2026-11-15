// Scale notes and accompaniment can differ, particularly in blues.
export const SCALES = {
  major: { label:'Major (Ionian)', intervals:[0, 2, 4, 5, 7, 9, 11], colour:4, progression:[0, 3, 4, 0], hint:'Bright and familiar. A good place to start.' },
  minor: { label:'Natural minor (Aeolian)', intervals:[0, 2, 3, 5, 7, 8, 10], colour:8, progression:[0, 5, 6, 0], hint:'Gentle, darker and familiar.' },
  'harmonic-minor': { label:'Harmonic minor', intervals:[0, 2, 3, 5, 7, 8, 11], colour:11, progression:[0, 3, 4, 0], hint:'Dramatic minor colour, with a strong pull back home.' },
  'melodic-minor': { label:'Melodic minor (jazz form)', intervals:[0, 2, 3, 5, 7, 9, 11], colour:9, progression:[0, 3, 4, 0], hint:'Minor with a brighter edge. Uses raised sixth and seventh in both directions (jazz form).' },
  dorian: { label:'Dorian', intervals:[0, 2, 3, 5, 7, 9, 10], colour:9, progression:[0, 3, 6, 0], hint:'Minor with a brighter sixth. Try it for a gentle groove.' },
  phrygian: { label:'Phrygian', intervals:[0, 1, 3, 5, 7, 8, 10], colour:1, progression:[0, 1, 3, 0], hint:'Dark and tense, with a close neighbour above the home note.' },
  lydian: { label:'Lydian', intervals:[0, 2, 4, 6, 7, 9, 11], colour:6, progression:[0, 1, 4, 0], hint:'Bright and floating, with a raised fourth.' },
  mixolydian: { label:'Mixolydian', intervals:[0, 2, 4, 5, 7, 9, 10], colour:10, progression:[0, 6, 3, 0], hint:'Major with a softer seventh. Good for a relaxed, folk-like feel.' },
  locrian: { label:'Locrian', intervals:[0, 1, 3, 5, 6, 8, 10], colour:6, progression:[0, 1, 2, 0], hint:'Unstable and tense, with a diminished home chord. An experimental option.' },
  blues: { label:'Minor blues', intervals:[0, 3, 5, 6, 7, 10], harmonyIntervals:[0, 2, 3, 5, 7, 8, 10], colour:6, progression:[0, 3, 4, 0], hint:'Six-note minor blues, with a short blue note resolving nearby. Matching minor-key chords can contain notes outside the melody scale.' },
  hijaz: { label:'Middle Eastern · Hijaz-inspired', intervals:[0, 1, 4, 5, 7, 8, 10], colour:1, progression:[0, 1, 3, 0], hint:'Hijaz-inspired colour in equal temperament (Phrygian dominant). A simplified melodic option, not a full traditional maqam performance.' }
};
const NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const mod = n => (n % 12 + 12) % 12;
export function scaleInfo(id) {
  if (!Object.hasOwn(SCALES, id)) throw new Error('Choose a valid scale or mode.');
  return SCALES[id];
}
export const isMinorScale = id => scaleInfo(id).intervals.includes(3) && !scaleInfo(id).intervals.includes(4);
export const scalePitches = (root, id) => scaleInfo(id).intervals.map(n => mod(root + n));
const QUALITIES = { '4,7':'', '3,7':'m', '3,6':'dim', '4,8':'aug', '4,7,10':'7', '4,7,11':'maj7', '3,7,10':'m7' };
export function scaleChord(root, id, degree, seventh = false) {
  const info = scaleInfo(id), intervals = info.harmonyIntervals || info.intervals;
  const tones = [0, 2, 4, ...(seventh ? [6] : [])].map(step => mod(root + intervals[(degree + step) % 7]));
  const chordRoot = tones[0], quality = tones.slice(1).map(n => mod(n - chordRoot)).join(',');
  // Unsupported seventh qualities stay triads to keep the chord vocabulary small.
  if (!Object.hasOwn(QUALITIES, quality)) {
    if (seventh) return scaleChord(root, id, degree);
    throw new Error('This scale needs an explicit accompaniment palette.');
  }
  return { name:NAMES[chordRoot] + QUALITIES[quality], root:chordRoot, tones };
}
export function matchingChords(root, id) {
  return scaleInfo(id).progression.map(degree => scaleChord(root, id, degree).name).join(' ');
}
export function scaleSeventh(chord, root, id) {
  const info = scaleInfo(id);
  const degree = (info.harmonyIntervals || info.intervals).map(n => mod(root + n)).indexOf(chord.root);
  if (degree < 0) return chord;
  const triad = scaleChord(root, id, degree);
  if (!triad.tones.every(n => chord.tones.includes(n))) return chord;
  return scaleChord(root, id, degree, true);
}
export function modalColour(root, id, seventh = false) {
  let borrowMajorIV = isMinorScale(id) && !scaleInfo(id).intervals.includes(9);
  const pcs = scalePitches(root, id);
  const candidate = (borrowMajorIV ? [5, 9, 0] : [5, 8, 0]).map(n => mod(root + n));
  if (candidate.every(pc => pcs.includes(pc))) borrowMajorIV = !borrowMajorIV;
  const chordRoot = mod(root + 5), suffix = borrowMajorIV ? (seventh ? '7' : '') : (seventh ? 'm7' : 'm');
  return {
    name:NAMES[chordRoot] + suffix, root:chordRoot,
    tones:(borrowMajorIV ? [0, 4, 7, ...(seventh ? [10] : [])] : [0, 3, 7, ...(seventh ? [10] : [])]).map(n => mod(chordRoot + n)),
    explanation:borrowMajorIV ? (isMinorScale(id) ? 'A major IV borrowed from Dorian adds a brighter colour.' : 'A major IV borrowed from the parallel major adds a brighter colour.') : 'A minor iv borrowed from the parallel natural minor adds a darker colour.'
  };
}
