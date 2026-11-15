# Sketch Composer · v0.7.0

A small local composer that turns a key, scale and chord progression into three eight-bar melody ideas. Listen, compare, and export editable MIDI for Logic Pro.

The second iteration develops a selected idea into a fixed 32-bar song: **Intro (4) → Verse 1 (8) → Chorus (8) → Verse 2 (8) → Ending (4)**.

## Run

From this folder, run:

```sh
npm start
```

Requires Node 18 or newer. Open **http://127.0.0.1:8000** in a modern browser. Keep the terminal running; press Ctrl+C to stop. There are no packages to install, accounts, API keys, model downloads or build steps. The small Node server serves the app and writes projects into `data/` beside `server.js`, regardless of the terminal’s working directory. If the old Python static server is running, stop it with Ctrl+C before starting this server. The Python static server cannot save projects to this folder. Optional: `PORT=8001 npm start` uses another port.

## Try it

1. Start with **A minor**, **Am F C E**, **90 BPM**.
2. Click **Generate 3 ideas**, then select and play each idea. Toggle **Hear chords** before starting playback to hear melody alone.
3. Try **C major** with **C G Am F**, then generate again. Each click creates fresh ideas.
4. Download a MIDI and import it into Logic Pro. The file contains named **Melody** and **Chords** tracks, tempo and 4/4 time. Assign instruments there. The preview sound is a basic oscillator synth.

Changing inputs takes effect when you generate; the displayed key, tempo, chords and export continue to describe the selected generated idea until then. The chords checkbox affects preview only; MIDI always includes both tracks. MIDI downloads are not project saves; use **Save project** to resume in this app later.

## Experimental local melody refinement

The core composer stays rules-based. **Improve melody** optionally uses the installed **Qwen3-8B** model through your local Ollama service, at `127.0.0.1:11434`. No model training, cloud API or new npm dependency is required. Your Mac already has `qwen3:8b`; on a new setup install Ollama from its official source, start it, and run `ollama pull qwen3:8b` once. Run the app with `npm start` as usual. The normal composer works when Ollama is unavailable.

1. Select an idea before arranging it, or select a section of an existing song. To preserve existing arrangements and chord edits, the original-idea view cannot be refined while a song exists; choose the relevant section instead.
2. Click **Improve melody · experimental**. The local model proposes two alternatives: one with pitch edits, one with note-length edits. It revises the whole selected phrase rather than continuing it. Generation can take longer when the model first loads. Cancel leaves your current melody unchanged.
3. Select **Original**, **Revision 1** or **Revision 2**, then press **Play** to compare. Amber notes show proposed changes. Model descriptions express intended effects, not a guarantee that the result sounds better.
4. Click **Keep this revision**, or **Discard revisions**. Export and Save are disabled while a revised melody is being previewed. Kept notes appear in MIDI exports and saved projects. An arranged section's revision leaves its chords and other sections untouched.
5. **Undo melody revision** restores the state immediately before keeping the revision, including its prior chord Undo history. This temporary Undo is cleared by changing idea/section, generating or arranging again, opening a project, starting another refinement or editing a chord. Unkept alternatives and Undo history are not saved. Save a project before experimenting if you want a lasting original version.

The model selects numbered changes from an app-generated catalogue of permitted edits. It can change at most three notes, and never more than 20% of the melody. Pitch edits are separated and limited to nearby, harmonically permitted pitches. Length edits stay within narrow bounds and preserve breathing spaces. Note starts, dynamics, chords, total length, opening notes and phrase-ending notes remain fixed. Blue notes must stay short and resolved by step. The complete result is validated again before preview and before keeping it. There is one retry for invalid output; a failed attempt leaves the original untouched. Two suggestions are required—there is no disguised rules-based fallback.

Only one model request runs at a time, with a three-minute timeout. You can use **Check local model** after starting Ollama. Advanced users can set `MELODY_MODEL` before starting the app to test another installed Ollama model that supports structured output; Qwen3-8B is the tested default. See [Ollama structured outputs](https://docs.ollama.com/capabilities/structured-outputs) and the [Qwen3-8B model page](https://ollama.com/library/qwen3:8b). This prototype is an editing experiment; listening comparisons determine whether its suggestions are useful.

## Save and reopen a composition

**Save project** at the top of the page writes a JSON file directly into the project’s `data/` directory. Each save uses a unique filename and preserves previous saved versions. The status message shows the relative file path. Saved JSON files are ignored by Git by default; the empty folder is retained with `.gitkeep`. It stores all three ideas, the selected idea, the complete arrangement and kept chord edits, the selected section, the harmony level, the chords playback toggle and the sketch input fields (including edits not yet generated). The actual notes are saved, so opening a project does not regenerate your music with a newer version of the engine.

Use **Open project**, choose a saved file from the `data/` list, then click **Open selected project** to restore the workspace. **Import project file…** opens a previously downloaded JSON file; click Save project afterwards to store it in `data/`. You can then listen, make further chord edits, save another project file or export MIDI as usual. Opening replaces the current workspace; save your current work first if you want to keep it. Invalid files are checked before replacing any music. The current format supports files up to 2 MB.

Keep or discard a pending chord preview before saving. Playback, unkept previews and Undo history are not saved; opening starts a fresh Undo history for your restored arrangement. All project files stay on your Mac. There is no automatic saving: click Save project before refreshing or closing the page. MIDI remains the exchange format for Logic Pro; JSON is the editable project format for this app.

## Explore scales and modes

Choose a key and **Scale / mode**, click **Use matching chords**, then **Generate 3 ideas**. Changing the dropdown does not overwrite your chords or regenerate your existing idea. A message explains when your own chord notes extend outside the selected scale. To compare modes clearly, keep the key and tempo the same and use matching chords for each selection.

| Option | Starting character to listen for |
| --- | --- |
| Major (Ionian) | Familiar and bright |
| Natural minor (Aeolian) | Darker and gentle |
| Harmonic minor | Dramatic, with a raised seventh pulling home |
| Melodic minor (jazz form) | Minor with raised sixth and seventh |
| Dorian | Minor with a brighter sixth |
| Phrygian | Tension from the lowered second |
| Lydian | A floating raised fourth |
| Mixolydian | Major with a relaxed lowered seventh |
| Locrian | Unsettled, with a diminished home chord |
| Minor blues | Six-note blues melody, with a short blue note resolving nearby |
| Middle Eastern · Hijaz-inspired | A lowered second followed by a major third, in equal temperament |

These descriptions are listening suggestions, not promises of a particular emotion or quality. Dorian and Mixolydian are useful first experiments. Locrian is deliberately less settled. Major/Ionian and Natural minor/Aeolian cover two of the seven modes; this release also adds the other five, plus harmonic minor and melodic minor. Rotations of harmonic and melodic minor are outside this iteration.

**Minor blues** uses `1, b3, 4, b5, 5, b7`. Its suggested accompaniment is a simple minor-key `i–iv–v–i` progression. Accompaniment notes can lie outside the six-note melody scale; melody generation keeps to the blues scale while choosing shared chord tones for anchors where available. The b5 is optional: it appears only as a short, stepwise connection between a nearby fourth and fifth, not at a fixed place in every phrase. This remains an eight-bar sketch with straight timing, not an automatic twelve-bar blues arrangement. See [Open Music Theory's blues reference](https://viva.pressbooks.pub/openmusictheory/chapter/blues-melodies-and-the-blues-scale/).

**Hijaz-inspired** uses `1, b2, 3, 4, 5, b6, b7` (the equal-tempered Phrygian dominant collection), with a matching `I–bII–iv–I` progression. Try **E** with **E F Am E**. The label describes a simplified colour for this Western MIDI/synth app, not a single universal Arabian scale or a full traditional maqam. Microtonal tuning, traditional melodic development and ornamentation are outside this version. [MaqamWorld's Hijaz page](https://www.maqamworld.com/en/maqam/hijaz.php) describes Hijaz's component ajnas and provides listening examples.

**Melodic minor uses the jazz form in both directions.** It does not switch to natural minor while descending as in the classical convention. See [Open Music Theory's minor-scale reference](https://viva.pressbooks.pub/openmusictheory/chapter/minor-scales/) and [Steps to Music Theory's modes reference](https://odp.library.tamu.edu/stepstomusictheory/chapter/modes/) for background.

The generator develops a two-bar motif, with chord-tone anchors and breathing spaces. Characteristic scale notes receive a small preference when they fit; they are not forced into the melody. The last note fits your last chord, resolving to the home note when that chord contains it. **Simple** arrangements use chords from your chosen scale (unless your supplied sketch already contains outside notes). **Intermediate** adds two sevenths and one borrowed chord; for new scales the added sevenths come from that scale. **Richer** intentionally introduces more outside harmony. The melody adapts to those chords, so the resulting song need not stay strictly in one mode. Existing major/minor tonal treatment is retained for intermediate/richer arrangements. Unsupported seventh chord qualities stay as triads rather than introducing a larger chord vocabulary.

## Arrange the selected idea

1. Select one of the three generated ideas and click **Arrange selected idea**.
2. Select a section to view its suggested chords, explanation of each added colour, adapted melody and piano roll. **Play** and **Download MIDI** apply to the displayed section (or the original idea when selected).
3. Start with **Intermediate** (the default): two seventh chords, at the end of the intro and before the final tonic, plus one modal triad in the chorus. All added chords last a full bar. No secondary dominants, diminished approaches or chromatic passing chords are added in this mode. Chords you explicitly entered, including any sevenths, remain in the verse sketch, so they may add to this total. In minor, the intermediate pre-dominant is a minor iv triad to keep the accompaniment straightforward.

Compare **Simple**, **Intermediate** and **Richer** song harmony. Changing this option rebuilds the song from the same original idea. Simple preserves your verse sketch and builds the other sections using the selected scale. Downloaded song filenames identify the harmony level.
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

**Undo chord change** reverses the most recent kept change, including its melody, and supports multiple steps. Only the selected chord's time span changes; other chords and sections stay intact. In richer arrangements this may be half a bar. The original idea remains untouched. Switching ideas, generating again, or rebuilding the arrangement clears chord edits and Undo history. Save a project before leaving to preserve your ideas, arrangement and kept edits.

Two chords joined by an arrow within one bar each occupy two beats. The selected idea's rhythm and contour provide the melody template. Strong or long notes move to nearby chord tones; featured advanced chords use chord tones throughout. Sustained notes split at chord changes as needed. The chorus shifts the melodic register up an octave before fitting its notes; the ending holds the tonic over the tonic chord. This is conservative reharmonisation, not a model trained on songs. Nearest-note adjustment can change the contour, and these template suggestions still need listening and musical judgement.

## Core sketch scope (retained from v0.1)

- Eight bars, 4/4, one chord per bar. A 1–8 chord progression repeats to fill the eight bars; incomplete repeats stop at bar eight.
- Eleven scale/mode options. Explicit chord tones can extend outside the selected scale; blues generation keeps the melody within its six-note collection over separate minor-key accompaniment. For example, E major supplies G♯ in A minor.
- Chord symbols: major (`C`), minor (`Am`), diminished (`Bdim`), augmented (`Caug`), dominant seventh (`G7`), major seventh (`Cmaj7`), minor seventh (`Dm7`). Sharps and flats supported. Separate chords using spaces, commas, arrows or `|`.
- Three selectable ideas, read-only melody piano roll, play/stop and MIDI export.
- Generation and audio run in your browser. Save/Open uses the loopback-only Node server and the local data/ directory. Nothing is sent to an external service or automatically saved.

The core generator uses musical rules. The eight bars follow a fixed phrase plan:

- **Bars 1–2 — Question:** establish a short motif, with an open ending and a breathing space.
- **Bars 3–4 — Variation:** return to the rhythm and outline with a small ending change.
- **Bars 5–6 — Development:** explore a higher part of the scale, with slightly stronger accents.
- **Bars 7–8 — Answer:** return to the idea and finish with a longer note.

Rhythms include eighth notes, longer notes, offbeat entries within the bar and written gaps. Pitch choices balance the motif's scale-step shape, nearby chord tones, moderate leaps and repetition. Phrases use accents and softer closing notes instead of one flat velocity. Scale-colour notes are optional. A seed makes generation reproducible within this version; older versions produce different tunes from the same seed.

**Endings respect your supplied harmony.** If the last chord contains the home note, the melody settles there. Otherwise it ends on a note that fits that chord and the UI labels the ending as open. For example, `Am F C E` keeps an open E-major ending; try `Am F C Am` for a settled A-minor ending. No supplied chords are silently replaced. The full song's Ending section still supplies its own final tonic cadence.

Generate fresh ideas after reloading to hear these changes. Existing arrangement fitting and chord editing keep the rest of the workflow intact.

This is a controllable starting point for hearing whether the workflow helps you compose. It does not guarantee compelling melodies. A message flags chord notes outside the selected scale, but chords are accepted as written. An ending can remain open if your last chord does not contain the tonic. There is no scoring model, sophisticated voice leading, MIDI import, note editing, keyboard recording or model training yet. Optional Qwen refinement edits the rule-generated melody as described above. Some ideas may sound similar.

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

- `scales.js`, `scales.test.js`: shared scale definitions, matching chord progressions, diatonic harmonisation, mode colours and all-key phrase/arrangement checks.

- `phrases.test.js`: recurring rhythms, rests, question/answer endings, leap limits, accents and preservation of breathing spaces in arrangements.

- `project.js`, `project.test.js`: versioned project files, validation, complete workspace restoration and MIDI round-trip checks.

- `server.js`, `server.test.js`: dependency-free local server, project listing/save/open API, file persistence and access-boundary checks.

- `refinement.js`, `refinement.test.js`, `local-model.js`: conservative edit catalogues, revision validation, local Qwen requests, comparison/keep helpers and model-protocol tests.
