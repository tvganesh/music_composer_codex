import { compose, midiBytes, noteName, ROOTS, parseChords } from './composer.js?v=0.5.0';
import { scaleInfo, scalePitches, matchingChords } from './scales.js?v=0.5.0';
import { arrange } from './arrangement.js?v=0.5.0';
import { chordChoices, changeChord } from './chord-edit.js?v=0.5.0';
const $ = id => document.getElementById(id);
let ideas = [], selected = 0, audio, voices = [], timer, frame;
let song = null, sectionIndex = -1, playbackVersion = 0;
let editingEvent = -1, draftSong = null, undoStack = [];
const currentPiece = () => sectionIndex < 0 ? ideas[selected] : (draftSong || song).sections[sectionIndex];
function resetEdits() { editingEvent = -1; draftSong = null; undoStack = []; }
function closeEditor() { editingEvent = -1; draftSong = null; }
const svgNS = 'http://www.w3.org/2000/svg';
function element(name, attrs, text) {
  const el = document.createElementNS(svgNS, name);
  Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
  if (text) el.textContent = text;
  $('roll').append(el);
  return el;
}
function stop() {
  playbackVersion++;
  clearTimeout(timer); cancelAnimationFrame(frame);
  voices.forEach(v => { try { v.stop(); } catch {} }); voices = [];
  document.getElementById('cursor')?.remove();
  $('play').disabled = false; $('stop').disabled = true;
}
function render() {
  stop(); const piece = currentPiece();
  $('details').textContent = `${piece.key} ${scaleInfo(piece.scale).label} · ${piece.tempo} BPM`;
  $('ideas').replaceChildren();
  ideas.forEach((_, i) => {
    const button = document.createElement('button'); button.type = 'button';
    button.textContent = `0${i + 1}  /  Idea ${i + 1}`; button.setAttribute('aria-pressed', i === selected);
    button.onclick = () => { selected = i; song = null; sectionIndex = -1; resetEdits(); render(); }; $('ideas').append(button);
  });
  renderSong();
  $('view-label').textContent = `${sectionIndex < 0 ? 'Original idea' : piece.name} · ${piece.bars} bars`;
  $('phrase-map').replaceChildren(); $('phrase-map').hidden = sectionIndex >= 0;
  if (sectionIndex < 0) for (const phrase of piece.phrases || []) {
    const span = document.createElement('span'); span.textContent = `${phrase.role} · ${phrase.start / 4 + 1}–${(phrase.start + phrase.beats) / 4}`;
    $('phrase-map').append(span);
  }
  $('phrase-summary').textContent = sectionIndex >= 0
    ? 'The arrangement keeps the idea’s rhythm and breathing spaces while fitting notes to the chords.'
    : piece.ending === 'open'
      ? 'A two-bar idea grows into a longer answer. This ending stays on your last chord; finish your chord sketch on the home chord for a settled ending.'
      : 'A two-bar idea grows into a longer answer. Gaps in the piano roll are breathing spaces; the last note settles on the home note.';
  $('chord-guide').textContent = sectionIndex < 0
    ? 'These are the original sketch chords. Arrange this idea to try chord alternatives in a song section.'
    : 'Editable chords: click a chord button below to hear alternatives. Each button shows one chord in this section.';
  $('start-chord-edit').hidden = sectionIndex >= 0;
  $('roll').setAttribute('aria-label', `${piece.bars}-bar melody piano roll: ${sectionIndex < 0 ? 'original idea' : piece.name}`);
  const pixelsPerBeat = 832 / piece.beats;
  $('chord-strip').replaceChildren();
  $('chord-strip').style.gridTemplateColumns = `repeat(${piece.bars},1fr)`;
  for (let bar = 0; bar < piece.bars; bar++) {
    const span = document.createElement('span');
    if (piece.events) piece.events.forEach((e, i) => {
      if (Math.floor(e.start / 4) !== bar) return;
      const button = document.createElement('button'); button.type = 'button'; button.textContent = e.chord.name;
      button.setAttribute('aria-label', `${e.chord.name}, bar ${bar + 1}, beat ${e.start % 4 + 1}: try another chord`);
      button.setAttribute('aria-pressed', editingEvent === i);
      button.onclick = () => { draftSong = null; editingEvent = i; render(); $('chord-choices').querySelector('button')?.focus(); };
      span.append(button);
    }); else span.textContent = piece.progression[bar % piece.progression.length].name;
    $('chord-strip').append(span);
  }
  renderChordEditor();
  $('roll').replaceChildren();
  const low = Math.min(...piece.melody.map(n => n.pitch)) - 2, high = Math.max(...piece.melody.map(n => n.pitch)) + 2;
  const row = 250 / (high - low + 1);
  for (let pitch = low; pitch <= high; pitch++) {
    const y = 10 + (high - pitch) * row;
    element('rect', { x:40, y, width:832, height:row, fill:[1,3,6,8,10].includes(pitch % 12) ? '#eff1e9' : '#fafbf7' });
    if (pitch % 12 === 0 || pitch === low) element('text', { x:4, y:y + row * .8, fill:'#788377', 'font-size':10 }, noteName(pitch));
  }
  for (let beat = 0; beat <= piece.beats; beat++) element('line', { x1:40 + beat * pixelsPerBeat, x2:40 + beat * pixelsPerBeat, y1:10, y2:260, stroke:beat % 4 === 0 ? '#cdd6c8' : '#e5e9df' });
  piece.melody.forEach(n => {
    const rect = element('rect', { x:40 + n.start * pixelsPerBeat, y:11 + (high - n.pitch) * row, width:n.duration * pixelsPerBeat, height:Math.max(3, row - 2), rx:3, fill:'#628665' });
    const title = document.createElementNS(svgNS, 'title'); title.textContent = `${noteName(n.pitch)}, bar ${Math.floor(n.start / 4) + 1}`; rect.append(title);
  });
  $('status').textContent = draftSong ? 'Preview only. Listen, then keep or discard the chord change.' : `${sectionIndex < 0 ? `Idea ${selected + 1}` : piece.name} ready. MIDI includes melody and chords.`;
}
function renderChordEditor() {
  const visible = song && sectionIndex >= 0 && editingEvent >= 0;
  $('chord-editor').hidden = !visible;
  $('undo').disabled = !undoStack.length;
  $('export').disabled = !!draftSong; $('export-song').disabled = !!draftSong; $('play-song').disabled = !!draftSong;
  if (!visible) return;
  const section = song.sections[sectionIndex], event = section.events[editingEvent];
  $('chord-editor-title').textContent = `${section.name} · bar ${Math.floor(event.start / 4) + 1} · ${event.chord.name}`;
  $('chord-editor-help').textContent = 'Try an alternative to hear this section with the melody adjusted. Other chords stay as they are.';
  $('chord-choices').replaceChildren();
  for (const choice of chordChoices(song, sectionIndex, editingEvent)) {
    const button = document.createElement('button'); button.type = 'button';
    const title = document.createElement('strong'); title.textContent = `${choice.label} · ${choice.chord.name}`;
    const detail = document.createElement('span'); detail.textContent = choice.explanation;
    button.append(title, detail); button.setAttribute('aria-pressed', !!draftSong && draftSong.sections[sectionIndex].events[editingEvent].chord.name === choice.chord.name);
    button.onclick = () => {
      draftSong = changeChord(song, sectionIndex, editingEvent, choice); render(); $('keep-chord').focus(); play(currentPiece(), false, `Previewing ${choice.chord.name}. Keep or discard this change.`);
    };
    $('chord-choices').append(button);
  }
  $('preview-actions').hidden = !draftSong;
}
$('keep-chord').onclick = () => {
  if (!draftSong) return;
  undoStack.push({ song, sectionIndex }); song = draftSong; closeEditor(); render(); $('status').textContent = 'Chord change kept. Undo is available.';
};
$('discard-chord').onclick = () => { draftSong = null; render(); $('status').textContent = 'Preview discarded. Your arrangement is unchanged.'; };
$('close-editor').onclick = () => { closeEditor(); render(); };
$('undo').onclick = () => {
  const previous = undoStack.pop(); if (!previous) return;
  song = previous.song; sectionIndex = previous.sectionIndex; closeEditor(); render(); $('status').textContent = 'Last chord change undone.';
};
function renderSong() {
  $('song').hidden = !song;
  if (!song) return;
  $('sections').replaceChildren();
  song.sections.forEach((section, i) => {
    const button = document.createElement('button'); button.type = 'button';
    button.setAttribute('aria-pressed', sectionIndex === i);
    const title = document.createElement('strong'); title.textContent = `${section.name} · ${section.bars} bars`;
    const chords = document.createElement('span'); chords.textContent = section.events.map(e => e.chord.name).join(' → ');
    button.append(title, chords); button.onclick = () => { closeEditor(); sectionIndex = i; render(); }; $('sections').append(button);
  });
  const section = sectionIndex < 0 ? null : song.sections[sectionIndex];
  $('section-description').textContent = section ? `${section.description} ${section.edited ? 'Melody updated to fit your chord choices.' : `${section.adaptedNotes} melody notes adapted from the original idea.`}` : 'Original idea selected. Choose a song section to inspect its adapted melody.';
  $('suggestions').replaceChildren();
  const seen = new Set();
  for (const e of section?.events || []) if (e.technique && !seen.has(e.technique + e.explanation)) {
    seen.add(e.technique + e.explanation);
    const li = document.createElement('li'); li.textContent = `${e.technique} · ${e.chord.name} (bar ${Math.floor(e.start / 4) + 1}${e.start % 4 ? ', beats 3–4' : ''}): ${e.explanation}`; $('suggestions').append(li);
  }
}
function buildSong() {
  song = arrange(ideas[selected], { level:$('harmony').value }); sectionIndex = 0; resetEdits(); render();
}
$('arrange').onclick = buildSong;
$('start-chord-edit').onclick = () => {
  if (!song) buildSong();
  closeEditor(); sectionIndex = 1; render();
  $('chord-strip').querySelector('button')?.focus();
};
$('harmony').onchange = () => { if (song) buildSong(); };
$('original').onclick = () => { closeEditor(); sectionIndex = -1; render(); };
$('sketch').addEventListener('submit', event => {
  event.preventDefault();
  try {
    const options = { key:$('key').value, scale:$('scale').value, chords:$('chords').value, tempo:Number($('tempo').value) };
    const seed = crypto.getRandomValues(new Uint32Array(1))[0];
    const next = [0, 1, 2].map(i => compose({ ...options, seed:(seed + i * 997) >>> 0 }));
    ideas = next; selected = 0; song = null; sectionIndex = -1; resetEdits(); $('error').textContent = ''; render();
  } catch (error) { $('error').textContent = error.message; }
});
async function play(piece = currentPiece(), wholeSong = false, message = '') {
  stop();
  const version = playbackVersion;
  try {
    audio ||= new (window.AudioContext || window.webkitAudioContext)();
    await audio.resume();
    if (version !== playbackVersion) return;
    const seconds = 60 / piece.tempo, start = audio.currentTime + .08;
    const notes = [...piece.melody.map(n => ({ ...n, chord:false })), ...($('accompaniment').checked ? piece.harmony.map(n => ({ ...n, chord:true })) : [])];
    for (const n of notes) {
      const oscillator = audio.createOscillator(), gain = audio.createGain();
      oscillator.type = n.chord ? 'sine' : 'triangle'; oscillator.frequency.value = 440 * 2 ** ((n.pitch - 69) / 12);
      const at = start + n.start * seconds, duration = n.duration * seconds;
      gain.gain.setValueAtTime(0, at); gain.gain.linearRampToValueAtTime(n.chord ? .035 : .12, at + .012);
      gain.gain.exponentialRampToValueAtTime(.001, at + duration);
      oscillator.connect(gain); gain.connect(audio.destination); oscillator.start(at); oscillator.stop(at + duration + .03); voices.push(oscillator);
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
    }
    $('play').disabled = true; $('stop').disabled = false;
    $('status').textContent = message || `Playing ${wholeSong ? 'whole song · 32 bars' : sectionIndex < 0 ? `idea ${selected + 1}` : piece.name}. Chords ${$('accompaniment').checked ? 'on' : 'off'}.`;
    if (!wholeSong) {
      const cursor = element('line', { id:'cursor', x1:40, x2:40, y1:10, y2:260, stroke:'#bb793e', 'stroke-width':2 });
      const animate = () => { const beat = Math.max(0, (audio.currentTime - start) / seconds); cursor.setAttribute('transform', `translate(${Math.min(piece.beats, beat) * 832 / piece.beats},0)`); frame = requestAnimationFrame(animate); }; animate();
    }
    timer = setTimeout(() => { stop(); $('status').textContent = 'Playback finished.'; }, (piece.beats * seconds + .15) * 1000);
  } catch (error) { stop(); $('status').textContent = `Playback unavailable: ${error.message}`; }
}
$('play').onclick = () => play();
$('play-song').onclick = () => play(song, true);
$('stop').onclick = () => { stop(); $('status').textContent = 'Playback stopped.'; };
function download(piece, label) {
  const blob = new Blob([midiBytes(piece)], { type:'audio/midi' });
  const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = `sketch-${piece.key}-${piece.scale}-${label}-${piece.seed}.mid`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  $('status').textContent = 'MIDI downloaded with melody and chord tracks. Import it into Logic Pro.';
}
$('export').onclick = () => download(currentPiece(), sectionIndex < 0 ? `idea-${selected + 1}` : currentPiece().name.replaceAll(' ', '-'));
$('export-song').onclick = () => download(song, `song-${song.level}`);
window.addEventListener('pagehide', stop);
function updateScaleGuide() {
  const key = $('key').value, scale = $('scale').value;
  $('scale-details').textContent = `${scaleInfo(scale).hint} Changes take effect when you generate ideas.`;
  $('matching-chords').title = matchingChords(ROOTS[key], scale);
  try {
    const pcs = scalePitches(ROOTS[key], scale), chords = parseChords($('chords').value);
    const outside = chords.some(c => c.tones.some(pc => !pcs.includes(pc)));
    $('scale-chord-check').textContent = scale === 'blues'
      ? 'Blues uses a six-note melody over minor-key chords; some accompaniment notes sit outside the melody scale. The blue note is used briefly.'
      : outside
      ? 'These chords add notes outside the selected scale. Use matching chords for a clearer scale flavour, or keep your own harmony.'
      : 'Your chord notes fit the selected scale.';
  } catch { $('scale-chord-check').textContent = ''; }
}
$('key').onchange = updateScaleGuide;
$('scale').onchange = updateScaleGuide;
$('chords').addEventListener('input', updateScaleGuide);
$('matching-chords').onclick = () => {
  $('chords').value = matchingChords(ROOTS[$('key').value], $('scale').value); updateScaleGuide();
};
updateScaleGuide();
$('sketch').requestSubmit();
