# 🧬 Sonic DNA Agent Pipeline System

## Overview

The Agent Pipeline System uses specialized AI agents to analyze music tracks efficiently. Each agent is an expert in a specific domain, working in parallel to build comprehensive Sonic DNA analysis.

## 🤖 Agent Team

### 1. **Technical Analyzer** (Priority: 9)
- **Specializes in:** BPM, key, scale, time signature, energy, danceability
- **Processing Time:** ~500ms
- **Can Process in Parallel:** Yes
- **Requires Audio File:** No

### 2. **Harmony Analyst** (Priority: 7)
- **Specializes in:** Harmonic analysis, scale, key signature, time signature
- **Processing Time:** ~3000ms
- **Can Process in Parallel:** Yes
- **Requires Audio File:** No

### 3. **Intention Analyst** (Priority: 7)
- **Specializes in:** Understanding the purpose and intention of the music
- **Processing Time:** ~3000ms
- **Can Process in Parallel:** Yes
- **Requires Audio File:** No

### 4. **Description Writer** (Priority: 8)
- **Specializes in:** Writing comprehensive track descriptions
- **Processing Time:** ~4000ms
- **Can Process in Parallel:** Yes
- **Requires Audio File:** No

### 5. **Drum Pattern Expert** (Priority: 6)
- **Specializes in:** Drum patterns, genre styles, pattern recognition
- **Processing Time:** ~3000ms
- **Can Process in Parallel:** Yes
- **Requires Audio File:** No

### 6. **Genre Specialist** (Priority: 6)
- **Specializes in:** Genre analysis, characteristics, influences, fusion
- **Processing Time:** ~4000ms
- **Can Process in Parallel:** Yes
- **Requires Audio File:** No

### 7. **Musicologist** (Priority: 5)
- **Specializes in:** Musicological analysis, era, style, production
- **Processing Time:** ~3500ms
- **Can Process in Parallel:** Yes
- **Requires MusicBrainz:** Yes (benefits from)

### 8. **Cultural Analyst** (Priority: 5)
- **Specializes in:** Cultural analysis, regional characteristics, cultural influences
- **Processing Time:** ~3500ms
- **Can Process in Parallel:** Yes
- **Requires MusicBrainz:** Yes (benefits from)

### 9. **Emotional Psychologist** (Priority: 4)
- **Specializes in:** Emotional intelligence, psychological profiles, mood analysis
- **Processing Time:** ~5000ms
- **Can Process in Parallel:** Yes
- **Requires Audio File:** No

## 🚀 Usage

### Single Track Analysis

```bash
cd web
node scripts/run-agent-pipeline.mjs --trackId abc123
```

### Batch Analysis (All Tracks)

```bash
# Analyze only tracks missing comprehensive analysis
node scripts/run-agent-pipeline.mjs

# Force regenerate all tracks
node scripts/run-agent-pipeline.mjs --force

# Limit number of tracks
node scripts/run-agent-pipeline.mjs --limit 50

# Custom batch size (parallel processing)
node scripts/run-agent-pipeline.mjs --batchSize 5
```

### Via API

```bash
# Single track
curl -X POST "http://localhost:3000/api/audio/sonic-dna-agents?trackId=abc123"

# All tracks
curl -X POST "http://localhost:3000/api/audio/regenerate-all-sonic-dna-agents?force=true"

# Check progress
curl "http://localhost:3000/api/audio/regenerate-all-sonic-dna-agents"
```

## ⚡ Performance Benefits

### Parallel Processing
- Agents process in parallel groups (up to 3 at once)
- Priority-based ordering ensures foundational data is ready first
- Total processing time: ~15-20 seconds per track (vs 30-40 seconds sequential)

### Intelligent Caching
- Results are cached per track
- Subsequent requests use cached data
- Cache key: `{trackTitle}-{artistName}`

### Specialized Expertise
- Each agent focuses on one domain
- Better quality analysis per domain
- Easier to optimize individual agents

### Efficient Resource Usage
- Only calls AI when needed
- Reuses comprehensive analysis data
- Parallel API calls reduce total time

## 📊 Pipeline Flow

```
1. Comprehensive Analysis (non-AI, fast)
   ↓
2. MusicBrainz Lookup (if available)
   ↓
3. Agent Pipeline (parallel processing)
   ├─ Technical Analyzer (Priority 9)
   ├─ Harmony Analyst (Priority 7)
   ├─ Intention Analyst (Priority 7)
   ├─ Description Writer (Priority 8)
   ├─ Drum Pattern Expert (Priority 6)
   ├─ Genre Specialist (Priority 6)
   ├─ Musicologist (Priority 5)
   ├─ Cultural Analyst (Priority 5)
   └─ Emotional Psychologist (Priority 4)
   ↓
4. Synthesis (combine all results)
   ↓
5. Database Storage
```

## 🔧 Architecture

### Base Agent Class
All agents extend `BaseAgent` which provides:
- Context validation
- Success/failure result creation
- Standardized interface

### Pipeline Orchestrator
Coordinates:
- Agent priority ordering
- Parallel processing groups
- Result caching
- Final synthesis

### Agent Context
Shared context includes:
- Track metadata
- Audio features
- Comprehensive analysis
- MusicBrainz data
- Previous agent results (for dependent agents)

## 📈 Monitoring

### Check Progress
```bash
node scripts/check-analysis-progress.mjs
```

### View Agent Performance
Agent results include:
- Success/failure status
- Processing time
- Confidence score
- Error messages (if failed)

## 🎯 When to Use

### Use Agent Pipeline When:
- ✅ You want faster processing (parallel execution)
- ✅ You need specialized analysis per domain
- ✅ You're processing many tracks
- ✅ You want better quality per domain

### Use Traditional Method When:
- ⚠️ You need a single comprehensive prompt
- ⚠️ You want simpler debugging
- ⚠️ You're processing just a few tracks

## 🔄 Migration

The agent pipeline is fully compatible with existing Sonic DNA data. You can:
- Use it alongside the traditional method
- Migrate existing tracks to agent pipeline
- Mix both methods in the same database

## 🛠️ Customization

### Add New Agent
1. Create new agent class extending `BaseAgent`
2. Implement `process()` method
3. Define `capabilities`
4. Register in `PipelineOrchestrator`

### Adjust Priorities
Modify `priority` in agent capabilities:
- Higher = processed first
- Lower = processed later
- Same priority = can process in parallel

### Change Batch Size
Adjust `batchSize` parameter:
- Default: 3 tracks in parallel
- Higher = faster but more API calls
- Lower = slower but safer for rate limits

## 📝 Notes

- Agents are stateless (can be scaled horizontally)
- Results are cached per track
- Failed agents don't block others
- All agents use same AI API keys (OpenAI/Anthropic)

