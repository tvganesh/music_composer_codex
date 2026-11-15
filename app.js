import { compose, midiBytes, noteName } from './composer.js';
import { arrange } from './arrangement.js';
const $ = id => document.getElementById(id);
let ideas = [], selected = 0, audio, voices = [], timer, frame;
let song = null, sectionIndex = -1, playbackVersion = 0;
const currentPiece = () => sectionIndex < 0 ? ideas[selected] : song.sections[sectionIndex];
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
  $('details').textContent = `${piece.key} ${piece.scale} · ${piece.tempo} BPM`;
  $('ideas').replaceChildren();
  ideas.forEach((_, i) => {
    const button = document.createElement('button'); button.type = 'button';
    button.textContent = `0${i + 1}  /  Idea ${i + 1}`; button.setAttribute('aria-pressed', i === selected);
    button.onclick = () => { selected = i; song = null; sectionIndex = -1; render(); }; $('ideas').append(button);
  });
  renderSong();
  $('view-label').textContent = `${sectionIndex < 0 ? 'Original idea' : piece.name} · ${piece.bars} bars`;
  $('roll').setAttribute('aria-label', `${piece.bars}-bar melody piano roll: ${sectionIndex < 0 ? 'original idea' : piece.name}`);
  const pixelsPerBeat = 832 / piece.beats;
  $('chord-strip').replaceChildren();
  $('chord-strip').style.gridTemplateColumns = `repeat(${piece.bars},1fr)`;
  for (let bar = 0; bar < piece.bars; bar++) { const span = document.createElement('span'); span.textContent = piece.events ? piece.events.filter(e => Math.floor(e.start / 4) === bar).map(e => e.chord.name).join(' → ') : piece.progression[bar % piece.progression.length].name; $('chord-strip').append(span); }
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
  $('status').textContent = `${sectionIndex < 0 ? `Idea ${selected + 1}` : piece.name} ready. MIDI includes melody and chords.`;
}
function renderSong() {
  $('song').hidden = !song;
  if (!song) return;
  $('sections').replaceChildren();
  song.sections.forEach((section, i) => {
    const button = document.createElement('button'); button.type = 'button';
    button.setAttribute('aria-pressed', sectionIndex === i);
    const title = document.createElement('strong'); title.textContent = `${section.name} · ${section.bars} bars`;
    const chords = document.createElement('span'); chords.textContent = section.events.map(e => e.chord.name).join(' → ');
    button.append(title, chords); button.onclick = () => { sectionIndex = i; render(); }; $('sections').append(button);
  });
  const section = sectionIndex < 0 ? null : song.sections[sectionIndex];
  $('section-description').textContent = section ? `${section.description} ${section.adaptedNotes} melody notes adapted from the original idea.` : 'Original idea selected. Choose a song section to inspect its adapted melody.';
  $('suggestions').replaceChildren();
  const seen = new Set();
  for (const e of section?.events || []) if (e.technique && !seen.has(e.technique + e.explanation)) {
    seen.add(e.technique + e.explanation);
    const li = document.createElement('li'); li.textContent = `${e.technique} · ${e.chord.name} (bar ${Math.floor(e.start / 4) + 1}${e.start % 4 ? ', beats 3–4' : ''}): ${e.explanation}`; $('suggestions').append(li);
  }
}
function buildSong() {
  song = arrange(ideas[selected], { level:$('harmony').value }); sectionIndex = 0; render();
}
$('arrange').onclick = buildSong;
$('harmony').onchange = () => { if (song) buildSong(); };
$('original').onclick = () => { sectionIndex = -1; render(); };
$('sketch').addEventListener('submit', event => {
  event.preventDefault();
  try {
    const options = { key:$('key').value, scale:$('scale').value, chords:$('chords').value, tempo:Number($('tempo').value) };
    const seed = crypto.getRandomValues(new Uint32Array(1))[0];
    const next = [0, 1, 2].map(i => compose({ ...options, seed:(seed + i * 997) >>> 0 }));
    ideas = next; selected = 0; song = null; sectionIndex = -1; $('error').textContent = ''; render();
  } catch (error) { $('error').textContent = error.message; }
});
async function play(piece = currentPiece(), wholeSong = false) {
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
    $('status').textContent = `Playing ${wholeSong ? 'whole song · 32 bars' : sectionIndex < 0 ? `idea ${selected + 1}` : piece.name}. Chords ${$('accompaniment').checked ? 'on' : 'off'}.`;
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
$('sketch').requestSubmit();
