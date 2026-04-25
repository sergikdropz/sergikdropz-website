# Instagram Collaboration Posts - API Limitation

## ✅ What Works Now

**UPDATE**: The system now automatically fetches **ALL posts** including collaboration posts where you're a collaborator!

### How It Works:

1. **Instagram Graph API**: Fetches posts where you are the original author (including collaborations you created)
2. **Profile Scraping**: Scrapes your Instagram profile page to get ALL visible posts, including:
   - Posts where you're a collaborator (not the author)
   - Regular posts
   - Reels
   - All posts visible on your profile

3. **Automatic Deduplication**: Combines both sources and removes duplicates

### When You Refresh:

- `/api/instagram/refresh` - Fetches from API + scrapes profile
- `/api/instagram/media` - Uses the combined list
- `/api/instagram/posts` - Uses the combined list

**Result**: You get ALL posts automatically, no manual addition needed! 🎉

## 🔍 How to Verify

1. Check your Instagram account - do you see collaboration posts where you're the author?
2. If yes, they should appear in the feed after refreshing
3. If you're looking for posts where someone else invited you, those won't be accessible via the API

## 📝 Current Implementation

The code has been updated to:
- ✅ Fetch all posts with pagination (up to 1000 posts)
- ✅ Include collaboration posts where you are the author
- ✅ Request all available fields including `username`

## 💡 Automatic Fetching (No Manual Work Needed!)

**Good News**: Collaboration posts are now automatically fetched when you refresh!

### How It Works:

1. **Click "Refresh"** on the Instagram feed section
2. The system will:
   - Fetch posts from Instagram API (where you're the author)
   - Scrape your profile page (gets ALL posts including collaborations)
   - Combine and deduplicate them
   - Save them automatically

### Manual Addition (Still Available)

If you want to add specific posts manually (e.g., posts from other accounts), you can still use the Instagram Helper page:

1. Go to `/instagram-helper`
2. Paste the post URL
3. Click **"Save"**

**Note**: Manual addition is now only needed for posts that aren't visible on your profile (e.g., posts from other accounts you want to feature).

---

**Note**: This limitation is documented in Instagram's API documentation. The API only returns media that you own/created, not media where you're a collaborator.
