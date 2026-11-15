import { SCALES, scaleInfo, scalePitches } from './scales.js?v=0.5.0';
export const ROOTS = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };
const QUALITIES = { '': [0, 4, 7], m: [0, 3, 7], dim: [0, 3, 6], aug: [0, 4, 8], '7': [0, 4, 7, 10], maj7: [0, 4, 7, 11], m7: [0, 3, 7, 10] };
export function parseChords(text) {
  const tokens = text.trim().replace(/→|->|\|/g, ',').split(/[\s,]+/).filter(Boolean);
  if (!tokens.length || tokens.length > 8) throw new Error('Enter 1–8 chords, separated by spaces or commas.');
  return tokens.map(name => {
    const match = /^([A-G](?:#|b)?)(maj7|m7|dim|aug|m|7)?$/.exec(name.replace(/♯/g, '#').replace(/♭/g, 'b'));
    if (!match || ROOTS[match[1]] === undefined) throw new Error(`Unrecognised chord: ${name}. Try Am, F, C, E, G7 or Dm7.`);
    const root = ROOTS[match[1]];
    return { name, root, tones: QUALITIES[match[2] || ''].map(n => (root + n) % 12) };
  });
}
function random(seed) {
  let state = seed >>> 0;
  return () => { state += 0x6D2B79F5; let t = state; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
export function compose({ key = 'A', scale = 'minor', chords = 'Am F C E', tempo = 90, seed = 1 } = {}) {
  if (ROOTS[key] === undefined || !Object.hasOwn(SCALES, scale)) throw new Error('Choose a valid key and scale.');
  if (!Number.isFinite(tempo) || tempo < 40 || tempo > 200) throw new Error('Tempo must be between 40 and 200 BPM.');
  const progression = parseChords(chords), rng = random(seed);
  const pcs = scalePitches(ROOTS[key], scale);
  const pick = values => values[Math.floor(rng() * values.length)];
  const root = ROOTS[key], intervals = scaleInfo(scale).intervals;
  // A two-bar rhythm is reused, with a breath at its end and a longer final answer.
  const opening = pick([
    [[0, 1], [1, .5], [1.5, .5], [2, 1], [3, .5]],
    [[0, .5], [.5, .5], [1.5, .5], [2, 1], [3, .5]],
    [[0, 1.5], [1.5, .5], [2, .5], [3, .5]]
  ]);
  const reply = pick([
    [[0, 1], [1.5, .5], [2, 1]],
    [[0, .5], [1, .5], [2, 1.25]],
    [[0, 1.5], [2, 1]]
  ]);
  const shape = pick([[0, 1, 2, 1, 0], [0, 2, 1, 3, 2], [2, 1, 0, 1, 0], [0, 1, 3, 2, 1]]);
  const replyShape = [shape[shape.length - 1], 1, 0];
  const melody = [], harmony = [];
  const scalePitch = degree => 60 + root + intervals[((degree % intervals.length) + intervals.length) % intervals.length] + 12 * Math.floor(degree / intervals.length);
  const pitches = Array.from({ length:25 }, (_, i) => 60 + i);
  let previous = 60 + root, repeated = 0;
  for (let bar = 0; bar < 8; bar++) {
    const chord = progression[bar % progression.length];
    chord.tones.forEach((pc, i) => {
      let pitch = 48 + pc;
      if (i && pitch < 48 + chord.root) pitch += 12;
      harmony.push({ pitch, start:bar * 4, duration:3.85, velocity:53 });
    });
    const rhythm = bar === 7 ? [[0, .75], [1, .75], [2, 2]] : bar % 2 ? reply : opening;
    const shared = chord.tones.filter(pc => pcs.includes(pc));
    const anchors = scale === 'blues' ? (shared.length ? shared : pcs) : chord.tones;
    rhythm.forEach(([beat, span], i) => {
      const phraseEnd = bar % 2 === 1 && i === rhythm.length - 1;
      const question = bar === 1 && phraseEnd;
      const final = bar === 7 && phraseEnd;
      const anchor = beat === 0 || beat === 2 || span >= 1.25;
      let allowed = anchor ? anchors : pcs;
      // Blue notes are added only as short, stepwise connections in the pass below.
      if (scale === 'blues') allowed = allowed.filter(pc => pc !== (root + 6) % 12);
      if (!allowed.length) allowed = pcs.filter(pc => scale !== 'blues' || pc !== (root + 6) % 12);
      if (question && allowed.some(pc => pc !== root)) allowed = allowed.filter(pc => pc !== root);
      if ((final || bar === 3 && phraseEnd) && anchors.includes(root)) allowed = [root];
      let degree = (bar % 2 ? replyShape : shape)[i % (bar % 2 ? replyShape.length : shape.length)];
      if (bar === 4 || bar === 5) degree += bar === 4 ? 2 : 1;
      if (bar === 2 && i === rhythm.length - 1) degree += 1;
      if (bar === 6 && i === rhythm.length - 1) degree -= 1;
      if (phraseEnd) degree = question ? 2 : 0;
      const target = scalePitch(degree);
      const candidates = pitches.filter(p => allowed.includes(p % 12));
      const ranked = candidates.map(pitch => {
        const leap = Math.abs(pitch - previous);
        const repeatPenalty = pitch === previous ? (repeated >= 1 ? 2.5 : .6) : 0;
        const colourBonus = !anchor && pitch % 12 === (root + scaleInfo(scale).colour) % 12 ? .25 : 0;
        return { pitch, score:Math.abs(pitch - target) + .35 * leap + Math.max(0, leap - 5) * 1.8 + repeatPenalty - colourBonus + rng() * .8 };
      }).sort((a, b) => a.score - b.score);
      const pitch = ranked[0].pitch;
      repeated = pitch === previous ? repeated + 1 : 0;
      const velocity = Math.min(100, (beat === 0 ? 86 : beat === 2 ? 81 : 73) + (bar >= 4 && bar < 6 ? 4 : 0) - (phraseEnd ? 5 : 0));
      melody.push({ pitch, start:bar * 4 + beat, duration:span * (phraseEnd ? .94 : .9), velocity });
      previous = pitch;
    });
  }
  if (scale === 'blues') {
    const blue = (root + 6) % 12;
    for (let i = 1; i < melody.length - 1; i++) {
      const before = melody[i - 1], note = melody[i], after = melody[i + 1];
      const middle = (before.pitch + after.pitch) / 2;
      if (note.start % 2 !== 0 && note.duration < .5 && after.start - note.start <= .5 && Math.abs(before.pitch - after.pitch) === 2 && middle % 12 === blue) note.pitch = middle;
    }
  }
  const ending = melody.at(-1).pitch % 12 === root ? 'resolved' : 'open';
  return { key, scale, tempo, seed, bars:8, beats:32, progression, melody, harmony, ending,
    phrases:[{ start:0, beats:8, role:'Question' }, { start:8, beats:8, role:'Variation' }, { start:16, beats:8, role:'Development' }, { start:24, beats:8, role:'Answer' }] };
}
export const noteName = pitch => ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'][pitch % 12] + (Math.floor(pitch / 12) - 1);

// Standard MIDI file, format 1: conductor + independent melody/chord tracks.
export function midiBytes(piece) {
  const ascii = text => [...text].map(c => c.charCodeAt(0));
  const u32 = n => [n >>> 24 & 255, n >>> 16 & 255, n >>> 8 & 255, n & 255];
  const vlq = n => { const bytes = [n & 127]; while ((n >>>= 7)) bytes.unshift((n & 127) | 128); return bytes; };
  const chunk = (name, bytes) => [...ascii(name), ...u32(bytes.length), ...bytes];
  const endTick = piece.beats * 480;
  const track = (name, notes, channel) => {
    const events = notes.flatMap(n => [
      { tick: Math.round(n.start * 480), data: [0x90 | channel, n.pitch, n.velocity] },
      { tick: Math.round((n.start + n.duration) * 480), data: [0x80 | channel, n.pitch, 0] }
    ]).sort((a, b) => a.tick - b.tick || a.data[0] - b.data[0]);
    const data = [0, 0xff, 3, ...vlq(name.length), ...ascii(name), 0, 0xc0 | channel, 0];
    let tick = 0;
    for (const e of events) { data.push(...vlq(e.tick - tick), ...e.data); tick = e.tick; }
    data.push(...vlq(endTick - tick), 0xff, 0x2f, 0);
    return chunk('MTrk', data);
  };
  const micros = Math.round(60000000 / piece.tempo);
  const conductor = [0, 0xff, 0x51, 3, micros >>> 16 & 255, micros >>> 8 & 255, micros & 255,
    0, 0xff, 0x58, 4, 4, 2, 24, 8];
  let markerTick = 0;
  for (const section of piece.sections || []) {
    const tick = Math.round(section.start * 480), name = ascii(section.name);
    conductor.push(...vlq(tick - markerTick), 0xff, 0x06, ...vlq(name.length), ...name);
    markerTick = tick;
  }
  conductor.push(...vlq(endTick - markerTick), 0xff, 0x2f, 0);
  return new Uint8Array([...chunk('MThd', [0, 1, 0, 3, 1, 224]), ...chunk('MTrk', conductor), ...track('Melody', piece.melody, 0), ...track('Chords', piece.harmony, 1)]);
}
