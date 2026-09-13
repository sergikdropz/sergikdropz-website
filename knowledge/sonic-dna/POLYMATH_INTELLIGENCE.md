# Sonic DNA polymath intelligence architecture

## Optimum sequence (intel v3)

```
1 Health          file / envelope integrity
2 Waveform        shared peaks (Father signal)
3 DSP measure     technical → drum ∥ harmony → bass pocket
4 Normalize       agent/local → measured schema
5 Classify lock   genre engine + overlays → audioPrimary + KB slice (+ conflict resolve)
6 Blend           optional catalog preference (hybrid; keep audioPrimary)
7 Polymath ∥      culture ∥ musicology ∥ emotion ∥ psychology ∥ psychoacoustics
8 Intention       serial — weave peer claims
9 Description     serial — quote the grid
10 Compose        encyclopedia sections / report layers
11 Challenge      audit + deterministic patches (groundedness, crate leak, bass, genre conflicts)
12 Publish        DB / cache infrastructure
```

Hard rules:
- LLMs never invent BPM / drums / key that contradict `measured`
- Title / folder / playlist are crates, not genre labels, after groove core exists
- Genre specialist runs **after** drum+harmony+bass so peers already wrote DSP onto the board
- Polymath / intention / description **skip** when BPM or drum family is missing (confidence gate)
- Psychology / psychoacoustics stamp report layers; encyclopedia fill preserves agent depth when substantial

## Agent DAG (`AGENT_COLLAB_WAVES`)

```
waveform (serial)
  → technical (serial)
  → measure-dsp: drum_pattern_expert ∥ harmony_analyst
  → measure-pocket: bass_pocket_analyst
  → classify-lock: genre_specialist (+ genre-engine lockGenreAndRefreshKb + conflict resolve)
  → polymath-specialists: cultural ∥ musicologist ∥ emotional ∥ psychology ∥ psychoacoustics
  → intention (serial)
  → description (serial)
```

Job recipe (`sonic-dna-v2.2-intel`):
`queued → health → waveform → measure → normalize → classify → blend → compose → challenge → publish → done`

Challenge stage runs `runAccuracyChallenge` by default (`skipChallenge: true` to opt out).

## Source of truth
- Measured DSP facts: `measured` on DNA
- Genre class: unified engine = `classifyGroove` + `genre-engine-rules.json`
- Encyclopedia: `knowledge/sonic-dna/genre-intelligence.json` (mirrored under `web/lib/audio/data/`)
- Collaboration bus: blackboard + `pipelineIntelligence` / `pipelineV2`
- Architecture module: `web/lib/audio/sonic-dna-v2/pipeline-architecture.ts`
- Train loop: `npm run sonic-dna:train-genre`

## Files
- `web/lib/audio/bass-pocket.ts`
- `web/lib/audio/sonic-dna-v2/accuracy-challenge.ts`
- `web/lib/audio/sonic-dna-v2/pipeline-architecture.ts`
- `web/lib/audio/sonic-dna-v2/agent-blackboard.ts`
- `web/lib/audio/sonic-dna-v2/merge-agent-wave.ts`
- `web/utils/sonicDNAAgents/bassPocketAnalyst.ts`
- `web/utils/sonicDNAAgents/psychologyAnalyst.ts`
- `web/utils/sonicDNAAgents/psychoacousticsAnalyst.ts`
- `web/lib/jobs/sonic-dna-job.ts`

## Still optional / future
- Live OlliN MCP inside measure jobs (Cursor/dev harness remains separate)
- LLM Accuracy Challenge debate loop (deterministic patches ship first)
- Gold-set scoring for psychology / psychoacoustics / intention prose
- Shared Python↔TS rule evaluator binary
