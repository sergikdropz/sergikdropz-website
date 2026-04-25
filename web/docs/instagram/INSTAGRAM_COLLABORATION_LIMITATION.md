# Instagram Collaboration Posts - API Limitation

## ⚠️ Important: API Limitation

**The Instagram Graph API does NOT support fetching posts where you are a collaborator (not the original author).**

This is a **fundamental limitation** of the Instagram Graph API, not a permissions issue. Even with additional permissions like:
- `instagram_business_manage`
- `instagram_business_content_publish`
- `pages_show_list`

The API will **only return posts where you are the original author**.

## ✅ What We've Implemented

### 1. Enhanced Permissions
We've added additional permissions to your OAuth flow:
- **Instagram Login**: `instagram_business_basic`, `instagram_business_content_publish`, `instagram_business_manage`
- **Facebook Login**: `instagram_basic`, `pages_read_engagement`, `pages_show_list`

### 2. Profile Scraping (Fallback)
We attempt to scrape your Instagram profile page to get ALL visible posts, including collaborations. However:
- Instagram may require authentication for profile scraping
- The HTML structure may change, breaking the scraper
- This is a fallback method, not guaranteed to work

### 3. Manual Addition
You can always manually add collaboration posts via `/instagram-helper` page.

## 🔄 Current Workflow

1. **API Fetch**: Gets posts where you're the author (with pagination)
2. **Profile Scraping**: Attempts to get all visible posts from your profile (including collaborations)
3. **Combination**: Merges both sources and removes duplicates

## 📝 If Scraping Doesn't Work

If profile scraping fails (which is likely due to Instagram's authentication requirements), you have two options:

1. **Manual Addition**: Add collaboration post URLs via `/instagram-helper`
2. **Wait for API Update**: Instagram may add this feature in the future (unlikely)

## 🎯 Recommendation

For collaboration posts where you're not the author:
- **Use the Instagram Helper page** to manually add them
- They will be automatically processed (scraped, downloaded, uploaded to Supabase)
- This is the most reliable method given the API limitations

---

**Note**: This limitation is documented in Instagram's API documentation. The `/media` endpoint only returns media owned by the Instagram Business Account, not media where the account is a collaborator.
