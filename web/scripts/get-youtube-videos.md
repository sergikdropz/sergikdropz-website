# How to Get YouTube Video IDs

## Method 1: From YouTube URL

1. Go to your YouTube video
2. Copy the URL (e.g., `https://www.youtube.com/watch?v=VIDEO_ID`)
3. Extract the `VIDEO_ID` from the URL
4. Add to `videos.json`

## Method 2: From YouTube Channel

1. Visit: https://youtube.com/@sergikdropz
2. Click on each video
3. Copy the video ID from the URL
4. Add to `videos.json`

## Video JSON Format

```json
{
  "id": "video-1",
  "title": "Video Title",
  "description": "Optional description",
  "youtube_id": "VIDEO_ID_HERE",
  "thumbnail": "optional-custom-thumbnail-url",
  "category": "performance",
  "date": "2025"
}
```

## Quick Add Script

You can also use YouTube's API or manually add videos. The component will automatically:
- Generate thumbnails from YouTube
- Create play buttons
- Embed videos when clicked

## Example

If your video URL is: `https://www.youtube.com/watch?v=dQw4w9WgXcQ`

Then `youtube_id` should be: `dQw4w9WgXcQ`

