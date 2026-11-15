import { ROOTS } from './composer.js?v=0.7.0';
import { scalePitches } from './scales.js?v=0.7.0';
import { validateMelodySource } from './project.js?v=0.7.0';

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const check = (ok, message) => { if (!ok) throw new Error(message); };
export function editOptions(piece) {
  validateMelodySource(piece);
  const pcs = scalePitches(ROOTS[piece.key], piece.scale);
  return piece.melody.map((note, index, notes) => {
    const next = notes[index + 1], end = note.start + note.duration;
    const cadence = !next || Math.floor(note.start / 8) !== Math.floor(next.start / 8);
    const locked = index === 0 || cadence;
    const chord = piece.events ? piece.events.find(e => note.start >= e.start && note.start < e.start + e.duration).chord
      : piece.progression[Math.floor(note.start / 4) % piece.progression.length];
    const anchor = note.start % 4 === 0 || note.start % 4 === 2 || note.duration >= 1;
    const allowed = piece.scale === 'blues' ? pcs : anchor ? chord.tones : [...new Set([...pcs, ...chord.tones])];
    const pitches = locked ? [note.pitch] : Array.from({ length:9 }, (_, i) => note.pitch - 4 + i)
      .filter(p => p >= 60 && p <= (piece.events ? 96 : 84) && (p === note.pitch || allowed.includes(p % 12)));
    const minDuration = locked ? note.duration : Math.round(Math.max(.15, note.duration * .7) * 1000) / 1000;
    const maxDuration = locked ? note.duration : Math.max(note.duration, Math.floor(Math.min(note.duration * 1.3, note.duration + .2,
      next.start - note.start - .06, (Math.floor(note.start / 4) + 1) * 4 - note.start - .04,
      next.start - end >= .5 ? note.duration : Infinity) * 1000) / 1000);
    return { index, pitch:note.pitch, start:note.start, duration:note.duration, velocity:note.velocity, chord:chord.name, locked, pitches, minDuration, maxDuration };
  });
}
export function validateRevision(piece, proposal) {
  const options = editOptions(piece), limit = Math.max(1, Math.floor(piece.melody.length * .2));
  check(proposal && typeof proposal.summary === 'string' && proposal.summary.length <= 500, 'Missing revision description.');
  check(Array.isArray(proposal.edits) && proposal.edits.length >= 1 && proposal.edits.length <= limit, `Use between 1 and ${limit} note edits.`);
  const melody = structuredClone(piece.melody), seen = new Set();
  for (const edit of proposal.edits) {
    check(edit && Number.isInteger(edit.index) && options[edit.index] && !seen.has(edit.index), 'Invalid or repeated note index.');
    const option = options[edit.index], note = melody[edit.index]; seen.add(edit.index);
    check(!option.locked, 'Opening and phrase-ending notes must stay unchanged.');
    check(Number.isInteger(edit.pitch) && option.pitches.includes(edit.pitch), `Note ${edit.index}: choose one of the permitted pitches.`);
    check(Number.isFinite(edit.duration) && edit.duration >= option.minDuration - 1e-8 && edit.duration <= option.maxDuration + 1e-8, `Note ${edit.index}: duration is outside its permitted range.`);
    check(edit.pitch !== note.pitch || Math.abs(edit.duration - note.duration) > .01, 'An edit must change its note.');
    note.pitch = edit.pitch; note.duration = edit.duration;
  }
  for (let i = 1; i < melody.length; i++) {
    check(melody[i - 1].start + melody[i - 1].duration <= melody[i].start + 1e-8, 'Revision contains overlapping notes.');
    const oldLeap = Math.abs(piece.melody[i].pitch - piece.melody[i - 1].pitch);
    check(Math.abs(melody[i].pitch - melody[i - 1].pitch) <= Math.max(7, oldLeap), 'Revision introduces an excessive melodic leap.');
  }
  if (piece.scale === 'blues') for (let i = 0; i < melody.length; i++) {
    if (![i - 1, i, i + 1].some(index => seen.has(index))) continue;
    const note = melody[i];
    if (note.pitch % 12 !== (ROOTS[piece.key] + 6) % 12) continue;
    check(i > 0 && i < melody.length - 1 && note.start % 2 !== 0 && note.duration < .5
      && Math.abs(melody[i - 1].pitch - note.pitch) === 1 && Math.abs(melody[i + 1].pitch - note.pitch) === 1
      && melody[i + 1].start - note.start <= .5, 'Keep blue notes short and resolved by step.');
  }
  const repeatedRun = notes => { let count = 1, max = 1; for (let i = 1; i < notes.length; i++) { count = notes[i].pitch === notes[i - 1].pitch ? count + 1 : 1; max = Math.max(max, count); } return max; };
  check(repeatedRun(melody) <= Math.max(3, repeatedRun(piece.melody)), 'Revision increases excessive repeated notes.');
  return { summary:proposal.summary, melody, changedNotes:seen.size };
}
export function validateRevisions(piece, response) {
  check(response && Array.isArray(response.revisions) && response.revisions.length === 2, 'The model must return two revisions.');
  const revisions = response.revisions.map(proposal => validateRevision(piece, proposal));
  check(!same(revisions[0].melody, revisions[1].melody), 'The two revisions must be different.');
  return revisions;
}
export function buildEditCatalog(piece) {
  const catalog = { pitch:[], length:[] };
  for (const option of editOptions(piece)) {
    if (option.locked) continue;
    const add = (kind, pitch, duration) => {
      const edit = { index:option.index, pitch, duration };
      try {
        validateRevision(piece, { summary:'Candidate edit', edits:[edit] });
        catalog[kind].push({ id:`${kind}-${catalog[kind].length + 1}`, ...edit, fromPitch:option.pitch, fromDuration:option.duration, chord:option.chord, start:option.start });
      } catch { /* Exclude individually invalid edits from the model's choices. */ }
    };
    // Keep pitch edits separated so individually safe choices cannot create a new leap together.
    if (option.index % 2 === 1) for (const pitch of option.pitches) {
      if (pitch !== option.pitch && pitch !== piece.melody[option.index - 1]?.pitch && pitch !== piece.melody[option.index + 1]?.pitch) add('pitch', pitch, option.duration);
    }
    for (const factor of [.85, 1.15]) {
      const duration = Math.round(option.duration * factor * 1000) / 1000;
      if (duration >= option.minDuration && duration <= option.maxDuration) add('length', option.pitch, duration);
    }
  }
  return catalog;
}
export function applyRefinement(ideas, song, selected, sectionIndex, revision) {
  const base = sectionIndex < 0 ? ideas[selected] : song.sections[sectionIndex];
  // Revalidate client-held preview data before keeping it.
  check(revision && Array.isArray(revision.melody) && revision.melody.length === base.melody.length, 'Invalid revision.');
  const edits = revision.melody.flatMap((n, i) => {
    const original = base.melody[i];
    check(n.start === original.start && n.velocity === original.velocity, 'Revision changed note starts or dynamics.');
    return n.pitch !== original.pitch || n.duration !== original.duration ? [{ index:i, pitch:n.pitch, duration:n.duration }] : [];
  });
  const validated = validateRevision(base, { summary:revision.summary, edits });
  if (sectionIndex < 0) {
    check(!song, 'Select a song section to refine an existing arrangement.');
    const next = structuredClone(ideas); next[selected].melody = validated.melody;
    return { ideas:next, song:null };
  }
  const next = structuredClone(song); next.sections[sectionIndex].melody = validated.melody; next.sections[sectionIndex].edited = true;
  next.melody = next.sections.flatMap(s => s.melody.map(n => ({ ...n, start:n.start + s.start })));
  return { ideas, song:next };
}
