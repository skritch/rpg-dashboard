## Offline Transcription

Transcribe a segment of audio. This writesa few files to `.data/C1E001-{start}-{stop}/`.

```
npx tsx tools/process_audio_file.ts .data/cr/C1E001.mp3 --start 3600 --end 3660
```

Re-execute just the post-transcription part of the audio pipeline:

```
npx tsx tools/raw_to_transcript.ts \
  .data/C1E001/transcription_results.json1 \
  deltas.json1
```

Write the transcript instead:

```
npx tsx tools/raw_to_transcript.ts \
  --full-transcript \
  .data/C1E001/transcription_results.json1 \
  transcript.txt
```

TODO: why not both?

To QA the transcription/segment-merging algorithm, use the Marimo notebook `tools/viz_transcripts.py` with an appropriate python environment. Either:

```
# Run as editable notebook
uv run marimo edit tools/viz-transcripts.py

# Render notebook as HTML
uv run marimo export html tools/viz-transcripts.py -o transcripts.html

# Or just serve the transcript visualization as HTML directly
uv run marimo run tools/viz-transcripts.py
```

Pass a directory (`.data/transcripts/C1E001-3600-3660/`) or just a dataset name (`C1E001-3600-3660`) as an an argument to any of these to
run the analysis of that transcription output in particular, e.g.:

```
uv run marimo run tools/viz-transcripts.py src/lib/server/transcription/fixtures/
```

JQ command to remove useless fields from transcript results:

```
cat transcription_results.json1 | jq -c 'del(.transcript.task, .transcript.language, .transcript.words) | .transcript.segments |= map(del(.tokens, .compressi
on_ratio, .seek, .temperature, .words))' > transcription_results_cleaned.json1

```

---

## Building the D&D Database

TODO: the source isn't complete for 2024 edition, find something else, or, pass the SRD pdf through an LLM.

- `generate-dnd-database.ts`
