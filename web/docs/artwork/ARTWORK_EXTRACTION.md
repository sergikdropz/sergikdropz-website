# Artwork Extraction from iTunes Metadata

The music library scanner now automatically extracts artwork from audio file metadata (iTunes/ID3 tags).

## How It Works

1. **Metadata Extraction**: The script reads metadata from audio files using the `music-metadata` library
2. **Artwork Extraction**: If embedded artwork is found, it's extracted and saved to `/public/images/artwork/`
3. **Fallback**: If no embedded artwork is found, the script looks for image files in the same directory as the audio file

## Supported Formats

- **MP3**: Full support for embedded artwork (ID3 tags)
- **M4A/AAC**: Full support for embedded artwork (iTunes metadata)
- **FLAC**: Full support for embedded artwork (Vorbis comments)
- **WAV**: Limited support - WAV files typically don't store embedded artwork

## File Format Notes

**WAV Files**: WAV files don't typically store artwork embedded in the file. If your WAV files have artwork in iTunes, you have two options:

1. **Place artwork files manually**: Add image files (JPG, PNG) in the same directory as your audio files with matching names
2. **Convert to MP3/M4A**: Files with embedded artwork (MP3, M4A) will have their artwork automatically extracted

## What Gets Extracted

- **Track Title**: From metadata (falls back to filename)
- **Artist**: From metadata (falls back to filename parsing)
- **Duration**: From audio file metadata
- **Artwork**: Embedded artwork extracted and saved as JPG/PNG

## Artwork Storage

Extracted artwork is saved to:
```
/public/images/artwork/[track-name].jpg
```

The artwork path is automatically added to the track entry in `music-library.json`.

## Running the Scan

1. Click "🔄 Scan Folders" button in the Music Library Vault
2. Or run manually: `node scripts/scan-music-library.mjs`

The script will:
- Scan all audio files
- Extract metadata and artwork
- Update `music-library.json`
- Save artwork images to `/public/images/artwork/`

## Tips

- **For best results**: Use MP3 or M4A files with embedded artwork
- **For WAV files**: Place artwork images in the same folder as your audio files
- **Artwork naming**: Image files should match the track name (e.g., `Track Name.jpg` for `Track Name.wav`)

