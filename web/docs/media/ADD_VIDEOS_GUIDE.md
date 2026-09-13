# How to Add YouTube Videos

## Quick Method (Manual)

1. **Visit your YouTube channel:**
   - https://youtube.com/@sergikdropz

2. **For each video:**
   - Click on the video
   - Copy the video ID from the URL
   - Example: `https://www.youtube.com/watch?v=VIDEO_ID_HERE`
   - The `VIDEO_ID_HERE` is what you need

3. **Add to `videos.json`:**
   ```json
   {
     "id": "video-1",
     "title": "Your Video Title",
     "description": "Optional description",
     "youtube_id": "VIDEO_ID_HERE",
     "category": "performance",
     "date": "2025"
   }
   ```

## Automated Method (YouTube API)

1. **Get YouTube API Key:**
   - Visit: https://console.cloud.google.com
   - Create a project
   - Enable "YouTube Data API v3"
   - Create credentials (API Key)

2. **Add to `.env.local`:**
   ```
   YOUTUBE_API_KEY=your_api_key_here
   YOUTUBE_CHANNEL_ID=@sergikdropz
   ```

3. **Fetch videos:**
   ```bash
   curl http://localhost:3000/api/youtube-videos
   ```

4. **Update `videos.json`** with the fetched data

## Video Card Features

- ✅ Automatic thumbnail generation from YouTube
- ✅ Click to play (embeds video)
- ✅ Responsive design
- ✅ Category tags
- ✅ Date display
- ✅ Link to full YouTube channel

## Example Video Entry

```json
{
  "id": "live-set-warehouse",
  "title": "SERGIK Live at Warehouse 215",
  "description": "Full live set from underground warehouse event",
  "youtube_id": "dQw4w9WgXcQ",
  "category": "performance",
  "date": "2024-12-15"
}
```

The component will automatically:
- Fetch thumbnail from YouTube
- Create play button overlay
- Embed video when clicked
- Handle errors gracefully

