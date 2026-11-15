import test from 'node:test';
import assert from 'node:assert/strict';
import { compose, midiBytes } from './composer.js';
import { arrange } from './arrangement.js';
import { SCALES, matchingChords } from './scales.js';
import { openProject, saveProject } from './project.js';
import { editOptions, buildEditCatalog, validateRevision, validateRevisions, applyRefinement } from './refinement.js';
import { refineWithModel, decodeModelChoices } from './local-model.js';

function proposals(piece) {
  const catalog = buildEditCatalog(piece);
  return decodeModelChoices({ pitchRevision:{ summary:'Try a nearby pitch.', editIds:[catalog.pitch[0].id] }, lengthRevision:{ summary:'Shorten a note.', editIds:[catalog.length[0].id] } }, catalog);
}
test('catalogues offer conservative edits and protect phrase endings in every scale', () => {
  for (const scale of Object.keys(SCALES)) {
    const piece = compose({ scale, chords:matchingChords(9, scale), seed:42 }), original = structuredClone(piece);
    const revisions = validateRevisions(piece, proposals(piece));
    assert.deepEqual(piece, original);
    for (const revision of revisions) {
      assert.ok(revision.changedNotes <= Math.floor(piece.melody.length * .2));
      const kept = applyRefinement([piece, piece, piece], null, 0, -1, revision).ideas[0];
      assert.deepEqual(kept.harmony, piece.harmony); assert.deepEqual(kept.progression, piece.progression);
      editOptions(piece).forEach((option, i) => {
        assert.equal(kept.melody[i].start, piece.melody[i].start);
        assert.equal(kept.melody[i].velocity, piece.melody[i].velocity);
        if (option.locked) assert.deepEqual(kept.melody[i], piece.melody[i]);
      });
    }
  }
});
test('invalid, excessive, repeated or ineffective edits are rejected', () => {
  const piece = compose({ seed:42 }), valid = proposals(piece).revisions[0], edit = valid.edits[0];
  for (const edits of [[], [{ ...edit, index:0 }], [edit, edit], [{ ...edit, index:999 }], [{ ...edit, pitch:127 }], [{ ...edit, duration:99 }], [{ ...edit, duration:NaN }],
    [{ ...edit, pitch:piece.melody[edit.index].pitch, duration:piece.melody[edit.index].duration }], Array(30).fill(edit)]) {
    assert.throws(() => validateRevision(piece, { summary:'Bad edit', edits }));
  }
  assert.throws(() => validateRevisions(piece, { revisions:[valid, valid] }), /different/);
  const revision = validateRevision(piece, valid); revision.melody[0].start = 1;
  assert.throws(() => applyRefinement([piece, piece, piece], null, 0, -1, revision), /starts/);
});
test('keeping a section revision preserves other sections, all chords and project MIDI persistence', () => {
  const ideas = [1, 19, 42].map(seed => compose({ seed }));
  for (const sectionIndex of [0, 1, 2, 4]) {
    const song = arrange(ideas[1], { level:'rich' }), before = structuredClone(song), section = song.sections[sectionIndex];
    const revision = validateRevisions(section, proposals(section))[0];
    const kept = applyRefinement(ideas, song, 1, sectionIndex, revision);
    assert.deepEqual(song, before); assert.deepEqual(kept.ideas, ideas);
    assert.deepEqual(kept.song.harmony, song.harmony);
    kept.song.sections.forEach((s, i) => { if (i !== sectionIndex) assert.deepEqual(s, song.sections[i]); else assert.deepEqual(s.events, section.events); });
    const state = { ...kept, selected:1, sectionIndex, harmony:'rich', accompaniment:true, inputs:{ key:'A', scale:'minor', chords:'Am F C E', tempo:'90' } };
    assert.deepEqual(midiBytes(openProject(saveProject(state)).song), midiBytes(kept.song));
    assert.deepEqual(midiBytes(before), midiBytes(song), 'original snapshot remains available for Undo');
  }
});
test('local model protocol uses a choice schema, retries rejected output and leaves the source untouched', async () => {
  const piece = compose({ seed:42 }), before = structuredClone(piece); let calls = 0;
  const transport = async (url, options) => {
    assert.equal(url, 'http://127.0.0.1:11434/api/chat');
    const request = JSON.parse(options.body), prompt = JSON.parse(request.messages[1].content);
    assert.equal(request.think, false); assert.equal(request.stream, false); assert.ok(request.format.properties.pitchRevision);
    calls++;
    const content = calls === 1 ? '{}' : JSON.stringify({ pitchRevision:{ summary:'Nearby pitch.', editIds:[prompt.catalog.pitch[0].id] }, lengthRevision:{ summary:'Shorter note.', editIds:[prompt.catalog.length[0].id] } });
    return { ok:true, json:async () => ({ message:{ content } }) };
  };
  const result = await refineWithModel(piece, { transport });
  assert.equal(calls, 2); assert.equal(result.revisions.length, 2); assert.deepEqual(piece, before);
  await assert.rejects(refineWithModel(piece, { transport:async () => ({ ok:true, json:async () => ({ message:{ content:'{}' } }) }) }), /No valid revisions/);
  await assert.rejects(refineWithModel(piece, { transport:async () => ({ ok:false, json:async () => ({ error:'Model not installed' }) }) }), /not installed/);
});
