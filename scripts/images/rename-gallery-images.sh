#!/bin/bash

# Gallery Image Renaming Script
# Use this to rename unorganized images to match expected filenames

GALLERY_DIR="web/public/images/gallery"

echo "🔄 Gallery Image Renamer"
echo "========================"
echo ""
echo "This script helps rename images to match expected gallery filenames."
echo ""

# Check if mapping file exists
if [ -f "image-mappings.txt" ]; then
  echo "📋 Found image-mappings.txt"
  echo "Reading mappings..."
  echo ""
  
  while IFS='|' read -r old_name new_name description; do
    if [ -f "$GALLERY_DIR/$old_name" ]; then
      if [ ! -f "$GALLERY_DIR/$new_name" ]; then
        echo "Renaming: $old_name → $new_name"
        mv "$GALLERY_DIR/$old_name" "$GALLERY_DIR/$new_name"
        echo "  ✅ Done"
      else
        echo "  ⚠️  $new_name already exists, skipping $old_name"
      fi
    else
      echo "  ❌ $old_name not found"
    fi
  done < image-mappings.txt
  
  echo ""
  echo "✅ Renaming complete!"
else
  echo "ℹ️  No image-mappings.txt found"
  echo ""
  echo "To use this script:"
  echo "1. Create a file called 'image-mappings.txt'"
  echo "2. Format: OLD_NAME|NEW_NAME|Description"
  echo "3. Example:"
  echo "   IMG_2011.jpg|club-neon-all-you-1.jpg|Club scene with neon"
  echo "   IMG_2014.jpg|dj-booth-lasers-1.jpg|DJ booth view"
  echo ""
  echo "4. Run this script again"
  echo ""
  echo "Or rename manually:"
  echo "  mv \"$GALLERY_DIR/OLD_NAME\" \"$GALLERY_DIR/NEW_NAME\""
fi

