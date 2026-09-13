#!/bin/bash

# SERGIK EPK - Image Organization Script
# This script helps organize your images into the correct directories

echo "🎨 SERGIK EPK - Image Setup"
echo "============================"
echo ""

# Create directories if they don't exist
mkdir -p "web/public/images/gallery"
mkdir -p "web/public/images/releases"

echo "📁 Created image directories:"
echo "   - web/public/images/gallery/"
echo "   - web/public/images/releases/"
echo ""

# Check if images directory exists in parent
if [ -d "images" ]; then
    echo "✅ Found 'images' directory in project root"
    echo "   Copying images..."
    
    # Copy gallery images
    if [ -d "images/gallery" ]; then
        cp images/gallery/*.jpg web/public/images/gallery/ 2>/dev/null
        cp images/gallery/*.jpeg web/public/images/gallery/ 2>/dev/null
        cp images/gallery/*.png web/public/images/gallery/ 2>/dev/null
        echo "   ✅ Copied gallery images"
    fi
    
    # Copy release artwork
    if [ -d "images/releases" ]; then
        cp images/releases/*.jpg web/public/images/releases/ 2>/dev/null
        cp images/releases/*.jpeg web/public/images/releases/ 2>/dev/null
        cp images/releases/*.png web/public/images/releases/ 2>/dev/null
        echo "   ✅ Copied release artwork"
    fi
else
    echo "ℹ️  No 'images' directory found in project root"
    echo ""
    echo "To add images:"
    echo "1. Create an 'images' folder in the project root"
    echo "2. Add your gallery images to 'images/gallery/'"
    echo "3. Add your release artwork to 'images/releases/'"
    echo "4. Run this script again: bash add-images.sh"
    echo ""
    echo "Or manually copy images to:"
    echo "   - web/public/images/gallery/"
    echo "   - web/public/images/releases/"
fi

echo ""
echo "📋 Expected filenames:"
echo ""
echo "Gallery Images (9 total):"
echo "   - desert-portrait-1.jpg"
echo "   - rooftop-portrait-1.jpg"
echo "   - performance-green-1.jpg"
echo "   - studio-red-1.jpg"
echo "   - performance-pioneer-1.jpg"
echo "   - sunset-portrait-1.jpg"
echo "   - performance-red-blue-1.jpg"
echo "   - performance-group-1.jpg"
echo "   - performance-closeup-1.jpg"
echo ""
echo "Release Artwork (6 total):"
echo "   - soul-candy.jpg"
echo "   - ftp.jpg"
echo "   - a-good-day.jpg"
echo "   - repeat-cozy-catz.jpg"
echo "   - say-yeah-remix.jpg"
echo "   - funky-bounce.jpg"
echo ""
echo "✅ Setup complete!"
echo ""
echo "💡 Tip: See IMAGE_MAPPING.md for detailed descriptions of each image"

