# 🚀 Quick Start: Run Comprehensive Analysis on All Tracks

## One Command to Analyze Everything

```bash
cd web
node scripts/run-comprehensive-analysis-all.mjs --force
```

This will:
- ✅ Analyze ALL tracks in your Supabase database
- ✅ Detect and save proper BPMs for each track
- ✅ Generate comprehensive Sonic DNA with all enhanced fields
- ✅ Link BPMs to the tempo tool for auto-update
- ✅ Process tracks in background (3 at a time)

## What You Need

1. **Next.js server running:**
   ```bash
   cd web
   npm run dev
   ```

2. **AI API key configured** (in `web/.env.local`):
   ```
   OPENAI_API_KEY=sk-...
   # OR
   ANTHROPIC_API_KEY=sk-ant-...
   ```

## Monitor Progress

```bash
# Check progress
curl "http://localhost:3000/api/audio/regenerate-all-sonic-dna"
```

## After Analysis

- ✅ All tracks have proper BPMs
- ✅ BPM automatically loads when track plays
- ✅ Tempo tool uses database BPM
- ✅ No re-analysis needed

---

**Full documentation:** See `RUN_COMPREHENSIVE_ANALYSIS.md` for details.

