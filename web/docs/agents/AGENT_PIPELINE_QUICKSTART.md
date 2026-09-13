# 🚀 Agent Pipeline Quick Start

## What is the Agent Pipeline?

A team of specialized AI agents that work together to analyze music tracks efficiently. Each agent is an expert in one domain (technical, emotional, cultural, etc.) and they process in parallel for speed.

## ⚡ Quick Start

### 1. Analyze All Tracks

```bash
cd web
node scripts/run-agent-pipeline.mjs --force
```

This will:
- ✅ Use 9 specialized AI agents
- ✅ Process 3 tracks in parallel
- ✅ Generate comprehensive Sonic DNA
- ✅ Save everything to database

### 2. Monitor Progress

```bash
# Check progress
node scripts/check-analysis-progress.mjs

# Or via API
curl "http://localhost:3000/api/audio/regenerate-all-sonic-dna-agents"
```

### 3. Analyze Single Track

```bash
node scripts/run-agent-pipeline.mjs --trackId abc123
```

## 🤖 The Agent Team

1. **Technical Analyzer** - BPM, key, time signature
2. **Harmony Analyst** - Scale, tonality, technical description
3. **Intention Analyst** - Purpose and message
4. **Description Writer** - Comprehensive track description
5. **Drum Pattern Expert** - Genre styles, pattern recognition
6. **Genre Specialist** - Characteristics, influences, fusion
7. **Musicologist** - Era, style, production context
8. **Cultural Analyst** - Regional, cultural context
9. **Emotional Psychologist** - Emotional intelligence

## ⚡ Why Use Agent Pipeline?

- **Faster:** Parallel processing (3 agents at once)
- **Better Quality:** Specialized expertise per domain
- **Efficient:** Intelligent caching and resource usage
- **Scalable:** Can process many tracks quickly

## 📊 Performance

- **Traditional Method:** ~30-40 seconds per track (sequential)
- **Agent Pipeline:** ~15-20 seconds per track (parallel)
- **Speed Improvement:** ~2x faster

## 🎯 Options

```bash
# Force regenerate all
--force

# Limit number of tracks
--limit 50

# Custom batch size (parallel tracks)
--batchSize 5

# Single track
--trackId abc123
```

## 📝 Requirements

- Next.js server running (`npm run dev`)
- AI API key configured (OpenAI or Anthropic)
- Supabase database connected

---

**Full Documentation:** See `AGENT_PIPELINE_GUIDE.md` for details.

