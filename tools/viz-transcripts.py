import marimo

__generated_with = "0.14.17"
app = marimo.App(width="medium")


@app.cell
def _():
    import marimo as mo
    return (mo,)


@app.cell
def _():
    import json
    import pandas as pd
    from bokeh.plotting import figure, show, output_notebook, output_file
    from bokeh.models import HoverTool, ColumnDataSource
    from bokeh.layouts import column
    from bokeh.io import curdoc
    import numpy as np

    # Enable notebook output
    output_notebook()
    return ColumnDataSource, HoverTool, figure, json, show


@app.cell
def _():
    import argparse
    parser = argparse.ArgumentParser()

    parser.add_argument("input", nargs='?', default='C1E001-3600-3660', help="A directory containing transcription_results.json1 and deltas.json1. If a full path to a directory is provided it will be used directly; if a string is used it will be treated as a path in .data/transcripts/")
    args = parser.parse_args()
    print(args.input)
    return (args,)


@app.cell
def _(args, load_transcription_data):
    import os

    # Determine the data directory
    if args.input.endswith('/'):
        # Treat as directory path
        data_dir = args.input.rstrip('/')
        if not os.path.exists(data_dir):
            raise FileNotFoundError(f"Directory does not exist: {data_dir}")
        if not os.path.isdir(data_dir):
            raise NotADirectoryError(f"Path exists but is not a directory: {data_dir}")
    else:
        # Treat as dataset name
        dataset = args.input or 'C1E001-3600-3660'  # Use default if empty
        data_dir = f'.data/transcripts/{dataset}'

    # Construct file paths
    raw_transcripts_filepath = f'{data_dir}/transcription_results.json1'
    deltas_filepath = f'{data_dir}/deltas.json1'
    full_transcript_filepath = f'{data_dir}/transcript.txt'

    print(f"Using data directory: {data_dir}")
    print(f"Transcription file: {raw_transcripts_filepath}")
    print(f"Deltas file: {deltas_filepath}")

    # Load the data
    transcript_results = load_transcription_data(raw_transcripts_filepath)
    deltas = load_transcription_data(deltas_filepath)

    print(f"Loaded {len(transcript_results)} transcripts, {len(deltas)} deltas")
    return deltas, full_transcript_filepath, transcript_results


@app.cell
def _(deltas, transcript_results):
    with_deltas = enrich_transcripts_with_deltas(transcript_results, deltas)
    segment_data = prepare_segment_data(with_deltas)

    print(f"Loaded {len(transcript_results)} transcripts with {len(segment_data['start'])} total segments")
    print(f"Time range: {min(segment_data['start']):.1f}s to {max(segment_data['end']):.1f}s")
    print(f"Transcript range: 0 to {len(transcript_results)-1}")

    # Show transcript timing info
    print("\n=== Transcript Timing ===")
    for i, result in enumerate(transcript_results):  # Show first 6
        transcript_end_time = segment_data['end'][i]
        transcript_start_time = segment_data['start'][i]
        n_deltas = sum(int(seg.get('in_delta', False)) for seg in with_deltas[i]['t']['segments'])
        print(f"T{i}: dur={result['t']['duration']}s, {transcript_start_time:.1f}s-{transcript_end_time:.1f}s, {n_deltas} segments in delta")
    return (segment_data,)


@app.cell
def _(create_transcript_timeline, segment_data, show):

    plot = create_transcript_timeline(segment_data)
    show(plot)
    return


@app.cell
def _(full_transcript_filepath, mo):

    with open(full_transcript_filepath) as f:
        transcript = '\n'.join(f.readlines())

    mo.md('## Full transcript:\n\n' + transcript)
    return


@app.cell
def _(json):
    # Load and parse the transcription data
    def load_transcription_data(filepath):
        """Load and parse JSONL transcription file into structured data."""
        transcripts = []

        with open(filepath, 'r') as f:
            for line_num, line in enumerate(f):
                line = line.strip()
                if line:
                    try:
                        transcript = json.loads(line)
                        transcripts.append(transcript)
                    except json.JSONDecodeError as e:
                        print(f"Error parsing line {line_num}: {e}")

        return transcripts
    return (load_transcription_data,)


@app.function
def enrich_transcripts_with_deltas(transcript_results, deltas):
    """
    Enrich raw transcript segments with in_delta boolean field by matching with delta segments.

    Args:
        raw_transcripts: List of raw transcript objects
        deltas: List of delta transcript objects

    Returns:
        List of enriched transcript objects with segments containing in_delta field
    """

    enriched = []
    tol = 0.1

    for ti, (result, d) in enumerate(zip(transcript_results, deltas)):
        t = result['t']
        out_t = t.copy()

        # assumes transcripts that advance by 5s with 30s windows
        offset_seconds = result['meta']['startPositionMs'] / 1000
        for ts in t['segments']:
            ts['in_delta'] = False
            ts['overwrite'] = d['delta']['overwrite']

        tsi = 0
        for dsi, ds in enumerate(d['delta']['segments']):
            start, end, text = ds['startMs'] / 1000, ds['endMs'] / 1000, ds['text']
            matched = False
            while not matched and tsi < len(t['segments']):
                ts = t['segments'][tsi]
                matched = abs((ts['start'] + offset_seconds) - start) < tol
                if matched:
                    # if times match, text should too
                    assert text == ts['text']
                    # deltas have clamped ends
                    assert (ts['end'] + offset_seconds) >= end - tol
                    out_t['segments'][tsi]['in_delta'] = True
                tsi = tsi + 1
            assert matched, f'in {ti}: delta {dsi}: {start}--{end} not matched'

        enriched.append({'meta': result['meta'], 't': out_t})

    return enriched


@app.function
# Parse segments into visualization-ready data
def prepare_segment_data(transcript_results):
    """Convert transcript segments into data suitable for Bokeh visualization."""
    data = {
        'transcript_id': [],
        'segment_id': [],
        'start': [],
        'end': [],
        'text': [],
        'avg_logprob': [],
        'no_speech_prob': [],
        'duration': [],
        'y_position': [],
        'width': [],
        'segment_text': [],
        'in_delta': [],
        'overwrite': []
    }

    for result in transcript_results:
        meta, transcript = result['meta'], result['t']
        index = meta['index']
        y_pos = index  # Negative to go downward

        # Calculate the offset based on when this transcript ENDS
        # Transcript 0 ends at 5s, transcript 1 ends at 10s, etc.
        transcript_start_time = meta['startPositionMs'] / 1000
        transcript_actual_duration = max(segment['end'] for segment in transcript['segments'])

        for i, segment in enumerate(transcript['segments']):
            # Adjust timestamps by transcript start offset
            adjusted_start = segment['start'] + transcript_start_time
            adjusted_end = segment['end'] + transcript_start_time

            data['transcript_id'].append(index)
            data['segment_id'].append(i)
            data['start'].append(adjusted_start)
            data['end'].append(adjusted_end)
            data['text'].append(segment['text'].strip())
            data['avg_logprob'].append(segment['avg_logprob'])
            data['no_speech_prob'].append(segment['no_speech_prob'])
            data['duration'].append(transcript_actual_duration)
            data['y_position'].append(y_pos)
            data['width'].append(adjusted_end - adjusted_start)
            data['segment_text'].append(f"T{index}S{segment['id']}: {segment['text'].strip()}")
            data['in_delta'].append(segment['in_delta'])
            data['overwrite'].append(segment['overwrite'])

    return data


@app.cell
def _(ColumnDataSource, HoverTool, figure):
    # Create the Bokeh visualization
    def create_transcript_timeline(segment_data):
        """Create an interactive timeline visualization of transcript segments."""

        # Add bottom positions to segment_data
        segment_data['y_bottom'] = [y - 0.8 for y in segment_data['y_position']]

        # Set alpha values based on in_delta field
        segment_data['alpha_values'] = [1.0 if in_delta else 0.3 for in_delta in segment_data['in_delta']]

        # Create ColumnDataSource for Bokeh
        source = ColumnDataSource(data=segment_data)

        # Configure hover tool with detailed metadata
        hover = HoverTool(tooltips=[
            ("Transcript", "@transcript_id"),
            ("Segment", "@segment_id"),
            ("Time", "@start{0.2f}s - @end{0.2f}s"),
            ("Duration", "@width{0.2f}s"),
            ("Text", "@text"),
            ("In Delta", "@in_delta"),
            ("# to overwrite", "@overwrite"),
            ("Avg LogProb", "@avg_logprob{0.3f}"),
            ("No Speech Prob", "@no_speech_prob{0.3f}"),
            ("Total Duration", "@duration{0.0f}s")
        ])

        # Create figure
        p = figure(
            width=800, 
            height=500,
            title="Interactive Transcript Timeline Visualization",
            x_axis_label="Time (seconds)",
            y_axis_label="Transcript Number",
            tools=[hover, "pan", "wheel_zoom", "box_zoom", "reset", "save"]
        )

        # Color segments by log probability (darker = higher confidence)
        # Normalize logprob to 0-1 range for coloring
        min_logprob = min(segment_data['avg_logprob'])
        max_logprob = max(segment_data['avg_logprob'])
        logprob_range = max_logprob - min_logprob

        colors = []
        for i, logprob in enumerate(segment_data['avg_logprob']):
            # Normalize to 0-1, then map to color intensity
            normalized = (logprob - min_logprob) / logprob_range if logprob_range > 0 else 0.5

            # Use different color schemes for delta vs non-delta segments
            green_intensity = int(50 + 150 * normalized)
            color = f"#{50:02x}{green_intensity:02x}{50:02x}"

            colors.append(color)

        source.data['colors'] = colors

        # Add rectangular segments using quad glyphs
        p.quad(
            left='start', 
            right='end', 
            top='y_position', 
            bottom='y_bottom',
            color='colors',
            alpha='alpha_values',  # Use variable alpha based on in_delta
            source=source,
            line_color="black",
            line_width=0.5
        )

        # Customize axes
        p.xaxis.axis_label_text_font_size = "12pt"
        p.yaxis.axis_label_text_font_size = "12pt"
        p.title.text_font_size = "14pt"

        return p
    return (create_transcript_timeline,)


if __name__ == "__main__":
    app.run()
