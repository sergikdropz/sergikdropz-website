#!/bin/bash

# Auto Review Images Script
# Opens images for visual review and helps create mappings

GALLERY_DIR="web/public/images/gallery"

echo "🖼️  Image Review Helper"
echo "======================"
echo ""

# Get unorganized images
unorganized=$(find "$GALLERY_DIR" -type f \( -iname "*.jpg" -o -iname "*.jpeg" -o -iname "*.png" -o -iname "*.webp" \) -exec basename {} \; | sort)

# Get expected filenames
expected=$(grep -o '"[^"]*\.jpg"' "web/data/gallery.json" | tr -d '"' | sed 's|.*/||' | sort)

# Filter unorganized
unorganized_only=""
for img in $unorganized; do
  if ! echo "$expected" | grep -q "^${img}$"; then
    unorganized_only="$unorganized_only $img"
  fi
done

echo "Found $(echo $unorganized_only | wc -w | tr -d ' ') unorganized images"
echo ""
echo "Options:"
echo "1. List all unorganized images with details"
echo "2. Open images in Finder (macOS)"
echo "3. Create mapping file template"
echo "4. View expected image descriptions"
echo ""
read -p "Choose option (1-4): " choice

case $choice in
  1)
    echo ""
    echo "📸 Unorganized Images:"
    count=1
    for img in $unorganized_only; do
      size=$(stat -f%z "$GALLERY_DIR/$img" 2>/dev/null)
      size_mb=$(echo "scale=2; $size / 1024 / 1024" | bc 2>/dev/null || echo "?")
      date=$(stat -f%Sm -t "%Y-%m-%d %H:%M" "$GALLERY_DIR/$img" 2>/dev/null || echo "unknown")
      echo "  $count. $img (${size_mb}MB, $date)"
      count=$((count + 1))
    done
    ;;
  2)
    echo "Opening gallery directory in Finder..."
    open "$GALLERY_DIR"
    echo "✅ Finder opened. Review images and note matches."
    ;;
  3)
    if [ -f "image-mappings.txt" ]; then
      echo "⚠️  image-mappings.txt already exists"
      read -p "Overwrite? (y/n): " overwrite
      if [ "$overwrite" != "y" ]; then
        echo "Cancelled"
        exit 0
      fi
    fi
    cp image-mappings-template.txt image-mappings.txt
    echo "✅ Created image-mappings.txt"
    echo "Edit it with your matches, then run: ./rename-gallery-images.sh"
    ;;
  4)
    echo ""
    echo "📋 Expected Image Descriptions:"
    grep -A 3 '"description"' "web/data/gallery.json" | grep -v '"description"' | sed 's/.*"\(.*\)".*/\1/' | head -21
    ;;
  *)
    echo "Invalid option"
    ;;
esac

