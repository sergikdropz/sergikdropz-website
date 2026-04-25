# AI API Keys Configuration

## Current Status

✅ **Anthropic API Key**: Configured and active
- Key: `ANTHROPIC_API_KEY=sk-ant-api03-...` (configured in `.env.local`)
- Used for: Sonic DNA comprehensive analysis
- Model: `claude-3-5-sonnet-20241022`
- Status: ✅ **Active and ready to use**

⚠️ **OpenAI API Key**: Present but commented out (inactive)
- Key exists in `.env.local` but is commented with `#`
- To activate: Remove the `#` from `# OPENAI_API_KEY=sk-...` in `.env.local`
- Falls back to Anthropic if OpenAI is not available
- Falls back to basic analysis if both are unavailable

## How It Works

The Sonic DNA analysis system uses a **fallback chain**:

1. **First Priority**: OpenAI API (if `OPENAI_API_KEY` is set)
2. **Second Priority**: Anthropic API (if `ANTHROPIC_API_KEY` is set)
3. **Fallback**: Basic analysis using MusicBrainz + BPM inference (no AI required)

## Current Configuration

The system is currently configured to use:
- ✅ Anthropic API (primary)
- ⚠️ OpenAI API (not configured - will skip to Anthropic)
- ✅ Fallback analysis (always available)

## Testing

To verify the API keys are working:

1. Run a Sonic DNA analysis on any track
2. Check the server logs for:
   - "Step 3: Generating AI analysis..."
   - "AI analysis completed" (success)
   - Or "Anthropic API failed, using fallback analysis" (if key is invalid)

## Adding OpenAI Key (Optional)

If you want to add OpenAI support:

1. Get your API key from: https://platform.openai.com/api-keys
2. Add to `web/.env.local`:
   ```bash
   OPENAI_API_KEY=sk-your-key-here
   ```
3. Restart your development server

## Troubleshooting

**If analysis fails:**
- Check that `.env.local` exists in the `web/` directory
- Verify the Anthropic API key is valid
- Check server logs for specific error messages
- The system will automatically fall back to basic analysis if AI fails

**If you see "Not Found" errors:**
- The Anthropic API key might be invalid or expired
- Check your Anthropic account: https://console.anthropic.com/settings/keys
- The system will use fallback analysis automatically

