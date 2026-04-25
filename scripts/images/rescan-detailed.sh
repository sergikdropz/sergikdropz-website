#!/bin/bash

GALLERY_DIR="web/public/images/gallery"
GALLERY_JSON="web/data/gallery.json"

echo "🔍 Detailed Gallery Image Rescan"
echo "=================================="
echo ""

# Get all image files with sizes
echo "📊 All Images in Gallery Directory:"
echo ""
find "$GALLERY_DIR" -type f \( -iname "*.jpg" -o -iname "*.jpeg" -o -iname "*.png" -o -iname "*.webp" \) -exec basename {} \; | sort | while read -r file; do
  size=$(stat -f%z "$GALLERY_DIR/$file" 2>/dev/null)
  size_mb=$(echo "scale=2; $size / 1024 / 1024" | bc 2>/dev/null || echo "?")
  if [ -f "$GALLERY_DIR/$file" ]; then
    # Check if it's in gallery.json
    basename_only=$(basename "$file")
    if grep -q "\"$basename_only\"" "$GALLERY_JSON" 2>/dev/null || grep -q "/$basename_only\"" "$GALLERY_JSON" 2>/dev/null; then
      echo "  ✅ $file (${size_mb}MB) - IN GALLERY"
    else
      echo "  📸 $file (${size_mb}MB) - NOT IN GALLERY"
    fi
  fi
done

echo ""
echo "📋 Missing Expected Images:"
grep -o '"[^"]*\.jpg"' "$GALLERY_JSON" | tr -d '"' | sed 's|.*/||' | sort | while read -r file; do
  if [ ! -f "$GALLERY_DIR/$file" ]; then
    echo "  ❌ $file"
  fi
done

echo ""
echo "📊 Summary:"
total=$(find "$GALLERY_DIR" -type f \( -iname "*.jpg" -o -iname "*.jpeg" -o -iname "*.png" -o -iname "*.webp" \) | wc -l | tr -d ' ')
in_gallery=$(grep -o '"[^"]*\.jpg"' "$GALLERY_JSON" | tr -d '"' | sed 's|.*/||' | while read -r file; do [ -f "$GALLERY_DIR/$file" ] && echo "1"; done | wc -l | tr -d ' ')
missing=$(grep -o '"[^"]*\.jpg"' "$GALLERY_JSON" | tr -d '"' | sed 's|.*/||' | while read -r file; do [ ! -f "$GALLERY_DIR/$file" ] && echo "1"; done | wc -l | tr -d ' ')
unorganized=$((total - in_gallery))

echo "  Total files: $total"
echo "  In gallery.json: $in_gallery"
echo "  Missing from files: $missing"
echo "  Unorganized (not in JSON): $unorganized"
