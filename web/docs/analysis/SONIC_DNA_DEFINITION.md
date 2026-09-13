# Sonic DNA: Deep Comprehensive Analysis Report

## Definition

**Sonic DNA** = **Deep Comprehensive Sonic DNA Analysis Report**

Sonic DNA is not just a simple analysis—it's a **deep, comprehensive analysis report** that provides complete musical intelligence for each track.

## What's Included

The Sonic DNA (Deep Comprehensive Analysis Report) includes:

### 1. Emotional Intelligence
- **Primary Emotions**: 3-5 specific emotions (e.g., "Euphoric", "Melancholic", "Aggressive")
- **Emotional Journey**: Deep description of emotional arc throughout the track
- **Psychological Profile**: How the track affects the listener's mental state
- **Mood Transitions**: Significant emotional shifts with timing and intensity

### 2. Musical Intelligence
- **Key Signature**: Exact musical key (e.g., "C major", "A minor")
- **Time Signature**: Rhythm structure (e.g., "4/4", "3/4", "6/8")
- **Scale**: Musical scale used (e.g., "Major", "Minor", "Dorian")
- **Harmonic Complexity**: Deep analysis of chord progressions, voice leading, tension/resolution
- **Rhythmic Patterns**: Detailed description of groove, syncopation, polyrhythms
- **Instrumentation**: Array of instruments/sounds with detailed descriptions
- **Production Techniques**: Specific production methods used
- **Musical Influences**: Artists/movements that influence the track

### 3. Historical Context
- **Era Influences**: Musical eras with detailed context
- **Historical Context**: How the track relates to music history and cultural movements
- **Evolution From**: Musical movements/styles that influenced the track
- **Innovation Points**: Unique innovations and what makes them innovative

### 4. Regional & Cultural Intelligence
- **Primary Regions**: Geographic/cultural regions with context
- **Cultural Influences**: Cultural traditions/styles with detailed explanations
- **Regional Characteristics**: How geography and culture shape the sound
- **Cross-Cultural Elements**: How cultures blend in the track

### 5. Genre Analysis
- **Primary Genres**: 2-3 primary genres with confidence levels
- **Subgenres**: Subgenres and micro-genres with context
- **Genre Fusion**: How genres blend and what makes the fusion unique
- **Genre Evolution**: How genres evolved in this track
- **Genre Characteristics**: Specific genre characteristics with explanations
- **Genre Influences**: Genre influences and how they manifest

### 6. Technical Analysis
- **BPM**: Beats per minute
- **Energy Level**: Energy score (1-10 scale)
- **Danceability**: Danceability score (1-10 scale)
- **Frequency Bands**: Analysis of kicks, snares, hihats, cymbals
- **Technical Description**: Production, mixing, sound design analysis
- **Key Detection**: Musical key with mode, scale, and confidence

### 7. Drum Pattern Analysis
- **Pattern Type**: Specific pattern type (e.g., "Four-on-the-floor", "Breakbeat")
- **Kick Pattern**: Detailed kick pattern with timing and dynamics
- **Snare Pattern**: Detailed snare pattern with placement and character
- **Hihat Pattern**: Detailed hihat pattern with variations and groove
- **Genre Styles**: Genre-specific drum styles identified
- **Pattern Recognition**: Deep description of drum pattern recognition and groove
- **Complexity**: Complexity level with explanation

### 8. Musicology Analysis
- **Compositional Structure**: Form and structure analysis
- **Theoretical Aspects**: Music theory analysis
- **Era Analysis**: Decade characteristics and production techniques
- **Style Analysis**: Stylistic elements and conventions
- **Production Analysis**: Production techniques, mixing approach, sound design

### 9. Track Description & Intention
- **Description**: Comprehensive track description (50-150 words)
- **Intention**: What the artist wants to achieve, the message, the function

## Storage

- **Location**: Supabase `audio_files.sonic_dna` column (JSONB)
- **Status**: Tracked in `audio_files.sonic_dna_status` (pending, processing, completed, failed)
- **Timestamp**: `audio_files.sonic_dna_analyzed_at` records when analysis was completed

## Access

- **In Music Library**: Each track has a `sonic_dna` reference object indicating status
- **Full Report**: The complete comprehensive analysis report is fetched from Supabase when the SonicDNA component is displayed
- **API**: Available via `/api/audio/sonic-dna?path=...` endpoint

## Generation

The Deep Comprehensive Sonic DNA Analysis Report is generated using:
- AI-powered analysis (OpenAI or Anthropic)
- MusicBrainz metadata integration
- Audio feature analysis (BPM, energy, frequency bands)
- Waveform data analysis
- Multi-agent pipeline for specialized analysis

## Summary

**Sonic DNA** is the **Deep Comprehensive Sonic DNA Analysis Report**—a complete musical intelligence report that provides deep insights into every aspect of a track, from emotional impact to technical production, from historical context to cultural influences.
