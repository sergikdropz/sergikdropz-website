# SERGIK Artist EPK - Web & Mobile Apps

Complete Electronic Press Kit (EPK) application for SERGIK artist, featuring both web and mobile applications.

## Project Structure

```
SERGIK-Artist/
├── web/                    # Next.js Web Application
│   ├── app/               # Next.js app directory
│   ├── components/        # React components
│   ├── data/              # JSON data files
│   └── public/            # Static assets
├── mobile/                # React Native Mobile App
│   ├── src/
│   │   ├── screens/      # Mobile screens
│   │   └── data/         # JSON data files
│   └── App.tsx           # Main app entry
└── README.md
```

## Web App Setup

### Prerequisites
- Node.js 18+ 
- npm or yarn

### Installation

```bash
cd web
npm install
```

### Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Build

```bash
npm run build
npm start
```

## Mobile App Setup

### Prerequisites
- Node.js 18+
- Expo CLI (`npm install -g expo-cli`)
- iOS Simulator (for Mac) or Android Studio

### Installation

```bash
cd mobile
npm install
```

### Development

```bash
npm start
```

Then:
- Press `i` for iOS simulator
- Press `a` for Android emulator
- Scan QR code with Expo Go app on your phone

## Features

### Web App
- ✅ Responsive design (mobile, tablet, desktop)
- ✅ Homepage with hero image
- ✅ About page with biography and influences
- ✅ Music page with all releases
- ✅ Performances page (festivals & venues)
- ✅ Gallery with filterable images
- ✅ Complete EPK page
- ✅ Social media integration

### Mobile App
- ✅ Native iOS and Android support
- ✅ Bottom tab navigation
- ✅ All content from web app
- ✅ Image gallery with modal viewer
- ✅ Deep linking to streaming platforms

## Data Structure

All artist data is stored in JSON files:
- `artist.json` - Core artist information
- `releases.json` - Discography
- `events.json` - Festival history
- `venues.json` - Venue information
- `gallery.json` - Image gallery data
- `social-proof.json` - Shared billing information

## Adding Images

### Web App
Place images in `web/public/images/`:
- `gallery/` - Gallery images
- `releases/` - Release artwork

### Mobile App
Update image URLs in `mobile/src/data/gallery.json` to point to your image hosting service or use local assets.

## Deployment

### Web App
Deploy to Vercel, Netlify, or any Node.js hosting:
```bash
cd web
npm run build
```

### Mobile App
Build with Expo:
```bash
cd mobile
expo build:ios
expo build:android
```

## Tech Stack

**Web:**
- Next.js 14
- React 18
- TypeScript
- Tailwind CSS

**Mobile:**
- React Native
- Expo
- TypeScript
- React Navigation

## Contact

For questions or updates, contact: sergikdrops@gmail.com

