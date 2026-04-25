#!/bin/bash

# Gallery Image Rescan Script
# Analyzes images in gallery directory and compares with gallery.json

GALLERY_DIR="web/public/images/gallery"
GALLERY_JSON="web/data/gallery.json"

echo "🔍 SERGIK Gallery Image Rescan"
echo "=============================="
echo ""

# Get all image files
all_images=$(find "$GALLERY_DIR" -type f \( -iname "*.jpg" -o -iname "*.jpeg" -o -iname "*.png" -o -iname "*.webp" \) | xargs -n1 basename | sort)

# Count images
total_count=$(echo "$all_images" | wc -l | tr -d ' ')
echo "📊 Found $total_count image files in gallery directory"
echo ""

# Extract expected filenames from gallery.json (just the basename)
expected_files=$(grep -o '"[^"]*\.jpg"' "$GALLERY_JSON" | tr -d '"' | sed 's|.*/||' | sort)

echo "📋 Expected images from gallery.json:"
found_files=""
echo "$expected_files" | while read -r file; do
  if [ -f "$GALLERY_DIR/$file" ]; then
    echo "  ✅ $file"
    echo "$file" >> /tmp/found_files.txt
  else
    echo "  ❌ $file (MISSING)"
  fi
done

echo ""
echo "📁 Unorganized images (not in gallery.json):"
unorganized=$(echo "$all_images" | grep -v -f <(echo "$expected_files" | sed 's/.*\///'))
if [ -z "$unorganized" ]; then
  echo "  (none)"
else
  echo "$unorganized" | while read -r file; do
    size=$(stat -f%z "$GALLERY_DIR/$file" 2>/dev/null | numfmt --to=iec-i --suffix=B 2>/dev/null || echo "unknown")
    echo "  📸 $file ($size)"
  done
fi

echo ""
echo "📊 Summary:"
expected_count=$(echo "$expected_files" | wc -l | tr -d ' ')
found_count=$(echo "$expected_files" | while read -r file; do [ -f "$GALLERY_DIR/$file" ] && echo "1"; done | wc -l | tr -d ' ')
missing_count=$((expected_count - found_count))
unorganized_count=$(echo "$unorganized" | grep -v "^$" | wc -l | tr -d ' ')

echo "  Expected images: $expected_count"
echo "  Found: $found_count"
echo "  Missing: $missing_count"
echo "  Unorganized: $unorganized_count"
echo "  Total files: $total_count"

