export const ROOTS = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };
const SCALES = { major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10] };
const QUALITIES = { '': [0, 4, 7], m: [0, 3, 7], dim: [0, 3, 6], '7': [0, 4, 7, 10], maj7: [0, 4, 7, 11], m7: [0, 3, 7, 10] };
export function parseChords(text) {
  const tokens = text.trim().replace(/→|->|\|/g, ',').split(/[\s,]+/).filter(Boolean);
  if (!tokens.length || tokens.length > 8) throw new Error('Enter 1–8 chords, separated by spaces or commas.');
  return tokens.map(name => {
    const match = /^([A-G](?:#|b)?)(maj7|m7|dim|m|7)?$/.exec(name.replace(/♯/g, '#').replace(/♭/g, 'b'));
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
  if (ROOTS[key] === undefined || !SCALES[scale]) throw new Error('Choose a valid key and scale.');
  if (!Number.isFinite(tempo) || tempo < 40 || tempo > 200) throw new Error('Tempo must be between 40 and 200 BPM.');
  const progression = parseChords(chords), rng = random(seed);
  const pcs = SCALES[scale].map(n => (n + ROOTS[key]) % 12);
  const pick = values => values[Math.floor(rng() * values.length)];
  const patterns = [[1, .5, .5, 1, 1], [.5, .5, 1, 1, 1], [1.5, .5, 1, 1], [1, 1, 2]];
  const rhythms = [pick(patterns), pick(patterns)];
  const contour = Array.from({ length: 6 }, () => pick([-2, -1, 0, 1, 2]));
  const melody = [], harmony = [];
  let previous = 69 + ROOTS[key] - 9;
  for (let bar = 0; bar < 8; bar++) {
    const chord = progression[bar % progression.length];
    chord.tones.forEach((pc, i) => {
      let pitch = 48 + pc;
      if (i && pitch < 48 + chord.root) pitch += 12;
      harmony.push({ pitch, start: bar * 4, duration: 3.85, velocity: 53 });
    });
    let beat = 0;
    const rhythm = bar === 7 ? [1, 1, 2] : rhythms[bar % 2];
    rhythm.forEach((duration, i) => {
      const final = bar === 7 && i === rhythm.length - 1;
      // Chord tones anchor beats 1 and 3; scale tones connect the anchors.
      const allowed = final ? [ROOTS[key]] : (beat === 0 || beat === 2 ? chord.tones : pcs);
      const target = previous + contour[i % contour.length] * (bar >= 4 && bar < 6 ? 2 : 1);
      const candidates = Array.from({ length: 25 }, (_, n) => n + 60).filter(n => allowed.includes(n % 12));
      const ranked = candidates.map(pitch => ({ pitch, score: Math.abs(pitch - target) + rng() * 2.5 })).sort((a, b) => a.score - b.score);
      const pitch = ranked[0].pitch;
      melody.push({ pitch, start: bar * 4 + beat, duration: duration * .9, velocity: beat === 0 ? 88 : 76 });
      previous = pitch;
      beat += duration;
    });
  }
  return { key, scale, tempo, seed, bars: 8, beats: 32, progression, melody, harmony };
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
