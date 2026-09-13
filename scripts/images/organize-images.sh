#!/bin/bash

# Script to help organize SERGIK images
# This will copy images and create a mapping file

SOURCE="/Users/machd/Desktop/SERGIK PHOTOS"
GALLERY="/Users/machd/Documents/SERGIK Web and app/web/public/images/gallery"

echo "📸 Organizing SERGIK Images"
echo "============================"
echo ""

# Copy all images
echo "Copying images from: $SOURCE"
cp "$SOURCE"/*.jpg "$GALLERY/" 2>/dev/null
cp "$SOURCE"/*.jpeg "$GALLERY/" 2>/dev/null

echo "✅ Images copied to gallery folder"
echo ""
echo "📋 Current images in gallery:"
ls -1 "$GALLERY" | grep -E '\.(jpg|jpeg)$'
echo ""
echo "📝 Next steps:"
echo "1. Review the images in: $GALLERY"
echo "2. Rename them to match the expected filenames:"
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
echo "💡 See IMAGE_MAPPING.md for detailed descriptions"

