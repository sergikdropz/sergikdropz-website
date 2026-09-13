#!/bin/bash

# Image Matching Script
# Helps identify which unorganized images match expected filenames

GALLERY_DIR="web/public/images/gallery"
GALLERY_JSON="web/data/gallery.json"

echo "🔍 Gallery Image Matcher"
echo "======================="
echo ""
echo "This script will help identify matches between unorganized images"
echo "and expected gallery images."
echo ""

# Get all unorganized images
unorganized=$(find "$GALLERY_DIR" -type f \( -iname "*.jpg" -o -iname "*.jpeg" -o -iname "*.png" -o -iname "*.webp" \) -exec basename {} \; | sort)

# Get expected filenames
expected=$(grep -o '"[^"]*\.jpg"' "$GALLERY_JSON" | tr -d '"' | sed 's|.*/||' | sort)

# Filter unorganized (not in expected list)
unorganized_only=""
for img in $unorganized; do
  if ! echo "$expected" | grep -q "^${img}$"; then
    unorganized_only="$unorganized_only $img"
  fi
done

echo "📸 Unorganized Images Available for Matching:"
echo ""
count=1
for img in $unorganized_only; do
  size=$(stat -f%z "$GALLERY_DIR/$img" 2>/dev/null)
  size_mb=$(echo "scale=2; $size / 1024 / 1024" | bc 2>/dev/null || echo "?")
  date=$(stat -f%Sm -t "%Y-%m-%d %H:%M" "$GALLERY_DIR/$img" 2>/dev/null || echo "unknown")
  echo "  $count. $img"
  echo "     Size: ${size_mb}MB | Date: $date"
  count=$((count + 1))
done

echo ""
echo "📋 Missing Expected Images:"
echo ""
count=1
while read -r img; do
  if [ ! -f "$GALLERY_DIR/$img" ]; then
    # Get description from gallery.json
    desc=$(grep -A 5 "\"$img\"" "$GALLERY_JSON" | grep "description" | cut -d'"' -f4 | head -1)
    echo "  $count. $img"
    [ -n "$desc" ] && echo "     $desc"
    count=$((count + 1))
  fi
done < <(grep -o '"[^"]*\.jpg"' "$GALLERY_JSON" | tr -d '"' | sed 's|.*/||' | sort)

echo ""
echo "💡 Next Steps:"
echo "1. Review the unorganized images visually"
echo "2. Match them to the expected images based on content"
echo "3. Use: mv \"$GALLERY_DIR/OLD_NAME\" \"$GALLERY_DIR/NEW_NAME\""
echo ""
echo "Or run: ./auto-match-images.sh (if available)"

