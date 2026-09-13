# Measured Sonic DNA (gitignored JSON lives here)

Run:

```bash
/opt/homebrew/bin/python3 -m venv knowledge/scripts/.venv
knowledge/scripts/.venv/bin/pip install -r knowledge/scripts/requirements-audio.txt
knowledge/scripts/.venv/bin/python knowledge/scripts/measure_sonic_dna.py --library-only --limit=5
node knowledge/scripts/apply_sonic_dna_measured.mjs --dry-run
```

Each `{audio_file_id}.json` is DSP-only: BPM, 16-step drum grid, bass lock, root/key, groove genre.
