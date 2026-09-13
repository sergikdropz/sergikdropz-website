# Stripe Integration Setup Guide

This guide will help you set up Stripe payments for selling high-quality audio files on your music page.

## Step 1: Install Dependencies

Run this command in the `web` directory:

```bash
npm install
```

This will install:
- `stripe` - Server-side Stripe SDK
- `@stripe/stripe-js` - Client-side Stripe SDK

## Step 2: Get Stripe API Keys

1. **Sign up for Stripe** (if you haven't already):
   - Go to https://stripe.com
   - Create an account or log in

2. **Get your API keys**:
   - Go to https://dashboard.stripe.com/apikeys
   - Copy your **Publishable key** (starts with `pk_test_...` or `pk_live_...`)
   - Copy your **Secret key** (starts with `sk_test_...` or `sk_live_...`)

3. **Add keys to environment variables**:
   
   Create or update `.env.local` in the `web` directory:
   
   ```bash
   # Stripe Keys
   STRIPE_SECRET_KEY=sk_test_your_secret_key_here
   NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_your_publishable_key_here
   STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret_here
   
   # Your site URL (for production, use your actual domain)
   NEXT_PUBLIC_SITE_URL=http://localhost:3000
   ```

## Step 3: Set Up Stripe Webhook

The webhook verifies completed payments. You need to set this up for production.

### For Local Development (Testing):

1. Install Stripe CLI: https://stripe.com/docs/stripe-cli
2. Run: `stripe listen --forward-to localhost:3000/api/stripe/webhook`
3. Copy the webhook signing secret (starts with `whsec_...`) to your `.env.local`

### For Production:

1. Go to https://dashboard.stripe.com/webhooks
2. Click "Add endpoint"
3. Enter your endpoint URL: `https://yourdomain.com/api/stripe/webhook`
4. Select event: `checkout.session.completed`
5. Copy the webhook signing secret to your Vercel environment variables

## Step 4: Add Your Tracks

Edit `web/data/purchasable-tracks.json` to add your tracks:

```json
{
  "tracks": [
    {
      "id": "my-track-1",
      "title": "My Awesome Track",
      "description": "High-quality lossless audio file",
      "price": 2.99,
      "formats": [
        {
          "type": "WAV",
          "file": "/audio/downloads/my-track-1.wav",
          "size": "50MB"
        },
        {
          "type": "FLAC",
          "file": "/audio/downloads/my-track-1.flac",
          "size": "35MB"
        },
        {
          "type": "MP3",
          "file": "/audio/downloads/my-track-1.mp3",
          "size": "8MB"
        }
      ],
      "previewUrl": "/audio/previews/my-track-1.mp3",
      "artwork": "/images/releases/my-track-1.jpg",
      "duration": 240
    }
  ]
}
```

## Step 5: Add Your Audio Files

Place your files in the following directories:

- **Download files**: `web/public/audio/downloads/`
  - WAV files: `track-name.wav`
  - FLAC files: `track-name.flac`
  - MP3 files: `track-name.mp3`

- **Preview files**: `web/public/audio/previews/`
  - MP3 previews: `track-name.mp3` (usually 30-60 seconds)

## Step 6: Add Your Apple Music Playlist

Edit `web/data/apple-music-playlists.json`:

```json
{
  "playlists": [
    {
      "id": "my-playlist",
      "title": "My Personal Playlist",
      "appleMusicUrl": "https://music.apple.com/us/playlist/your-actual-playlist-id",
      "description": "Curated selection of my favorite tracks",
      "featured": true
    }
  ]
}
```

**To get your Apple Music playlist URL:**
1. Open Apple Music (web or app)
2. Go to your playlist
3. Click "Share" → "Copy Link"
4. Paste the URL in the `appleMusicUrl` field

## Step 7: Test the Integration

1. **Start your development server**:
   ```bash
   npm run dev
   ```

2. **Test with Stripe test cards**:
   - Go to https://stripe.com/docs/testing
   - Use test card: `4242 4242 4242 4242`
   - Any future expiry date
   - Any 3-digit CVC

3. **Test the flow**:
   - Go to `/music` page
   - Find a purchasable track
   - Click "Purchase"
   - Complete checkout with test card
   - Verify download works after purchase

## Step 8: Deploy to Production

1. **Add environment variables to Vercel**:
   - Go to your Vercel project settings
   - Navigate to "Environment Variables"
   - Add all variables from `.env.local`
   - Use **live** Stripe keys (not test keys) for production

2. **Set up production webhook**:
   - Follow Step 3 above with your production domain
   - Make sure to use the production webhook secret

3. **Deploy**:
   ```bash
   npm run build
   vercel --prod
   ```

## Security Notes

- ✅ Never commit `.env.local` to git (it's already in `.gitignore`)
- ✅ Use test keys for development, live keys for production
- ✅ Files are verified via Stripe session before download
- ✅ Only paid sessions can download files

## Troubleshooting

### "Stripe not configured" error
- Make sure `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` is set in `.env.local`
- Restart your dev server after adding environment variables

### Download fails
- Check that the file exists at the path specified in `purchasable-tracks.json`
- Verify the file is in `web/public/audio/downloads/`
- Check server logs for file read errors

### Webhook not working
- Make sure `STRIPE_WEBHOOK_SECRET` is set correctly
- For local dev, use Stripe CLI to forward webhooks
- For production, verify the webhook endpoint URL is correct

### Apple Music embed not showing
- Verify the playlist URL is correct
- Make sure the playlist is public (not private)
- Check browser console for iframe errors

## Support

For Stripe-specific issues, check:
- Stripe Documentation: https://stripe.com/docs
- Stripe Support: https://support.stripe.com

