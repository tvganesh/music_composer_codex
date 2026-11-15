import test from 'node:test';
import assert from 'node:assert/strict';
import { compose, midiBytes, ROOTS } from './composer.js';
import { arrange } from './arrangement.js';

test('arrangement preserves the selected idea and covers all five sections without gaps', () => {
  for (const key of Object.keys(ROOTS)) for (const scale of ['major', 'minor']) for (const level of ['simple', 'intermediate', 'rich']) {
    const idea = compose({ key, scale, seed:19 });
    const before = structuredClone(idea), song = arrange(idea, { level });
    assert.deepEqual(idea, before);
    assert.deepEqual(song, arrange(idea, { level }));
    assert.deepEqual(song.sections.map(s => s.name), ['Intro', 'Verse 1', 'Chorus', 'Verse 2', 'Ending']);
    assert.deepEqual(song.sections.map(s => s.start), [0, 16, 48, 80, 112]);
    assert.equal(song.bars, 32); assert.equal(song.beats, 128);
    for (const section of song.sections) {
      let end = 0;
      for (const e of section.events) { assert.equal(e.start, end); end += e.duration; }
      assert.equal(end, section.beats);
      end = 0;
      for (const n of section.melody) {
        assert.ok(n.start >= end - 1e-9); assert.ok(n.duration > 0);
        assert.ok(n.pitch >= 60 && n.pitch <= 96);
        const e = section.events.find(e => n.start >= e.start && n.start < e.start + e.duration);
        assert.ok(n.start + n.duration <= e.start + e.duration + 1e-9);
        if (n.start === e.start || n.start % 2 === 0 || n.duration >= 1) assert.ok(e.chord.tones.includes(n.pitch % 12));
        end = n.start + n.duration;
      }
      assert.ok(end <= section.beats);
    }
    assert.equal(song.melody.at(-1).pitch % 12, ROOTS[key]);
    assert.equal(song.sections.at(-1).events.at(-1).chord.root, ROOTS[key]);
  }
});

test('advanced suggestions resolve to their stated destinations and alter melody for chromatic chords', () => {
  for (const chords of ['Am F C E', 'C C C C', 'Bdim Bdim Bdim Bdim']) {
    const idea = compose({ chords, seed:42 });
    const song = arrange(idea, { level:'rich' });
    const techniques = new Set(song.sections.flatMap(s => s.events.map(e => e.technique)));
    for (const technique of ['Seventh', 'Modal colour', 'Secondary dominant', 'Diminished approach', 'Chromatic passing chord']) assert.ok(techniques.has(technique));
    for (const s of song.sections) for (let i = 0; i < s.events.length; i++) {
      const e = s.events[i], next = s.events[i + 1];
      if (e.technique === 'Secondary dominant') assert.equal((e.chord.root - next.chord.root + 12) % 12, 7);
      if (['Diminished approach', 'Chromatic passing chord'].includes(e.technique)) assert.equal((next.chord.root - e.chord.root + 12) % 12, 1);
      if (e.technique && e.technique !== 'Seventh') {
        const notes = s.melody.filter(n => n.start >= e.start && n.start < e.start + e.duration);
        assert.ok(notes.length > 0);
        if (e.technique !== 'Modal colour') for (const n of notes) assert.ok(e.chord.tones.includes(n.pitch % 12));
      }
    }
    assert.ok(song.sections.some(s => s.adaptedNotes > 0));
    assert.ok(arrange(idea, { rich:false }).sections.every(s => s.events.every(e => !e.technique)));
  }
});

test('intermediate defaults to only two sevenths and one modal triad across the whole song', () => {
  for (const key of Object.keys(ROOTS)) for (const scale of ['major', 'minor']) {
    const idea = compose({ key, scale, chords:key + (scale === 'minor' ? 'm' : ''), seed:4 });
    const song = arrange(idea), events = song.sections.flatMap(s => s.events);
    assert.equal(song.level, 'intermediate');
    assert.equal(events.filter(e => e.chord.tones.length === 4).length, 2);
    assert.equal(events.filter(e => e.technique === 'Seventh').length, 2);
    const modal = events.filter(e => e.technique === 'Modal colour');
    assert.equal(modal.length, 1); assert.equal(modal[0].chord.tones.length, 3);
    assert.ok(events.every(e => e.duration === 4));
    assert.ok(events.every(e => !e.chord.name.includes('dim')));
    assert.ok(events.every(e => ['', 'Seventh', 'Modal colour'].includes(e.technique)));
    const chorus = song.sections[2];
    for (const n of chorus.melody.filter(n => n.start >= 16 && n.start < 20)) assert.ok(modal[0].chord.tones.includes(n.pitch % 12));
    assert.equal(song.sections[1].events[0].chord.name, idea.progression[0].name);
  }
  const custom = compose({ chords:'Am7 Fmaj7 C E7' });
  assert.deepEqual(arrange(custom).sections[1].events.slice(0, 7).map(e => e.chord.name), ['Am7', 'Fmaj7', 'C', 'E7', 'Am7', 'Fmaj7', 'C']);
  assert.equal(arrange(custom, { rich:true }).level, 'rich');
  assert.equal(arrange(custom, { rich:false }).level, 'simple');
});

test('whole-song MIDI includes section markers, balanced notes and 128-beat track endings', () => {
  const song = arrange(compose({ seed:4 })), bytes = midiBytes(song), view = new DataView(bytes.buffer);
  let pos = 14;
  const markers = [], counts = [];
  for (let track = 0; track < 3; track++) {
    const end = pos + 8 + view.getUint32(pos + 4); pos += 8;
    const vlq = () => { let n = 0, b; do { b = bytes[pos++]; n = (n << 7) | (b & 127); } while (b & 128); return n; };
    let tick = 0, noteOns = 0, ended = false; const active = new Set();
    while (pos < end) {
      tick += vlq(); const status = bytes[pos++];
      if (status === 0xff) {
        const type = bytes[pos++], length = vlq();
        if (type === 6) markers.push({ tick, name:String.fromCharCode(...bytes.slice(pos, pos + length)) });
        if (type === 0x2f) { assert.equal(tick, 128 * 480); ended = true; }
        pos += length;
      } else if ((status & 0xf0) === 0xc0) pos++;
      else {
        const pitch = bytes[pos++]; pos++;
        if ((status & 0xf0) === 0x90) { assert.ok(!active.has(pitch)); active.add(pitch); noteOns++; }
        else { assert.ok(active.has(pitch)); active.delete(pitch); }
      }
    }
    assert.equal(active.size, 0); assert.ok(ended); counts.push(noteOns);
  }
  assert.equal(pos, bytes.length);
  assert.deepEqual(counts, [0, song.melody.length, song.harmony.length]);
  assert.deepEqual(markers, song.sections.map(s => ({ tick:s.start * 480, name:s.name })));
});
