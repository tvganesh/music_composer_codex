# Sketch Composer · v0.3

A small local composer that turns a key, scale and chord progression into three eight-bar melody ideas. Listen, compare, and export editable MIDI for Logic Pro.

The second iteration develops a selected idea into a fixed 32-bar song: **Intro (4) → Verse 1 (8) → Chorus (8) → Verse 2 (8) → Ending (4)**.

## Run

From this folder, run:

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

Open **http://127.0.0.1:8000** in a modern browser. Keep the terminal running; press Ctrl+C to stop. If you have Node installed, `npm start` runs the same command. There are no packages to install, accounts, API keys, model downloads or build steps. Serve the folder rather than opening the HTML file directly, because the JavaScript uses modules.

## Try it

1. Start with **A minor**, **Am F C E**, **90 BPM**.
2. Click **Generate 3 ideas**, then select and play each idea. Toggle **Hear chords** before starting playback to hear melody alone.
3. Try **C major** with **C G Am F**, then generate again. Each click creates fresh ideas.
4. Download a MIDI and import it into Logic Pro. The file contains named **Melody** and **Chords** tracks, tempo and 4/4 time. Assign instruments there. The preview sound is a basic oscillator synth.

Changing inputs takes effect when you generate; the displayed key, tempo, chords and export continue to describe the selected generated idea until then. The chords checkbox affects preview only; MIDI always includes both tracks. Downloads are not project saves.

## Arrange the selected idea

1. Select one of the three generated ideas and click **Arrange selected idea**.
2. Select a section to view its suggested chords, explanation of each added colour, adapted melody and piano roll. **Play** and **Download MIDI** apply to the displayed section (or the original idea when selected).
3. Start with **Intermediate** (the default): just two dominant sevenths, at the end of the intro and before the final tonic, plus one modal triad in the chorus. All added chords last a full bar. No secondary dominants, diminished approaches or chromatic passing chords are added in this mode. Chords you explicitly entered, including any sevenths, remain in the verse sketch, so they may add to this total. In minor, the intermediate pre-dominant is a minor iv triad to keep the accompaniment straightforward.

Compare **Simple**, **Intermediate** and **Richer** song harmony. Changing this option rebuilds the song from the same original idea. Simple still preserves advanced chords you entered yourself and uses basic functional cadences. Downloaded song filenames identify the harmony level.
4. Use **Play whole song** or **Download song MIDI** for the entire 32-bar arrangement. Song MIDI includes Intro, Verse 1, Chorus, Verse 2 and Ending markers plus separate melody/chord tracks.
5. Use **Back to original idea** to compare the untouched source. Selecting another idea or generating new ideas clears the previous arrangement.

Richer harmony suggests:

- **Sevenths:** major/minor sevenths add colour; the key's dominant uses a dominant seventh.
- **Modal colour:** a borrowed minor iv7 in major, or a Dorian major IV7 in minor.
- **Secondary dominants:** a V7 immediately before its target chord, selected from the verse progression where possible.
- **Diminished approaches:** a half-bar diminished triad rooted a semitone below its next chord.
- **Chromatic passing chords:** a half-bar major triad moving up a semitone into its destination.

## Change one chord at a time

After arranging an idea, select a section and click a chord above the piano roll. Choose from up to three alternatives: **Keep it simple**, **Add warmth**, or **Add contrast**. Options that match the current chord are omitted. Each option previews the section with the altered chord and fitted melody; enable **Hear chords** to hear the harmony too.

Click **Keep this change** to apply it, or **Discard preview** to return to your arrangement. Closing the editor or selecting another chord/section also discards the unkept preview. Downloads and whole-song playback are disabled while a preview is pending. Normal Play replays the preview. Kept changes appear in section and full-song playback and MIDI exports.

**Undo chord change** reverses the most recent kept change, including its melody, and supports multiple steps. Only the selected chord's time span changes; other chords and sections stay intact. In richer arrangements this may be half a bar. The original idea remains untouched. Switching ideas, generating again, or rebuilding the arrangement clears chord edits and Undo history. Edits are kept only in the current browser session; download MIDI before leaving.

Two chords joined by an arrow within one bar each occupy two beats. The selected idea's rhythm and contour provide the melody template. Strong or long notes move to nearby chord tones; featured advanced chords use chord tones throughout. Sustained notes split at chord changes as needed. The chorus shifts the melodic register up an octave before fitting its notes; the ending holds the tonic over the tonic chord. This is conservative reharmonisation, not a model trained on songs. Nearest-note adjustment can change the contour, and these template suggestions still need listening and musical judgement.

## Core sketch scope (retained from v0.1)

- Eight bars, 4/4, one chord per bar. A 1–8 chord progression repeats to fill the eight bars; incomplete repeats stop at bar eight.
- Major or natural minor as the melody's scale, with explicit chord tones allowed outside that scale. For example, E major supplies G♯ in A minor.
- Chord symbols: major (`C`), minor (`Am`), diminished (`Bdim`), dominant seventh (`G7`), major seventh (`Cmaj7`), minor seventh (`Dm7`). Sharps and flats supported. Separate chords using spaces, commas, arrows or `|`.
- Three selectable ideas, read-only melody piano roll, play/stop and MIDI export.
- Generation and audio run entirely in your browser. Nothing is uploaded or automatically saved.

No trained model is used. Two rhythm patterns and a short pitch contour are reused across the eight bars; chord tones anchor bar openings and available third beats, with nearby scale tones connecting them. Bars five and six widen the contour, and the final note returns to the key's tonic. A seed makes each generated idea reproducible in code.

This is a controllable starting point for hearing whether the workflow helps you compose. It does not guarantee compelling melodies. Chords are accepted as written without checking whether they belong to the selected key. The final tonic may clash with an arbitrary final chord. There is no scoring model, sophisticated voice leading, project storage, MIDI import, note editing, keyboard recording or AI generation yet. Some ideas may sound similar.

## Next iteration: listen first

Start with intermediate harmony and try changing one chord at a time. Import one full-song export into Logic Pro. Judge **melodic shape**, **rhythm**, **fit with your chords** and **contrast between sections**. The form and bar lengths remain fixed; free-form chord entry within sections and section-length editing are deferred. Keep model integration as a separate decision after this experiment.

## Checks and files

With Node 18 or newer, run `npm test`. Tests cover chord validation, repeatable generation across keys, melody bounds and harmony anchors, plus independent MIDI decoding to verify notes, timing, tempo and track endings.

Arrangement tests cover all supported roots in major and minor, unchanged source ideas, complete section/chord timing, melody fit, secondary-dominant and semitone resolutions, all five suggested harmony techniques, and balanced MIDI note events with section markers across the full 128 beats.

- `writeup`: original discussion, preserved unchanged.
- `composer.js`: composition rules and MIDI writer, independent of the UI.
- `app.js`, `index.html`, `style.css`: controls, piano roll and Web Audio playback.
- `composer.test.js`: engine and export checks.
- `arrangement.js`, `arrangement.test.js`: song form, suggested harmony, melody adaptation and arrangement checks.
- `chord-edit.js`, `chord-edit.test.js`: chord alternatives and isolated chord/melody changes.
