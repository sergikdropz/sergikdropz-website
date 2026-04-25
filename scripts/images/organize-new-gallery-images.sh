#!/bin/bash

# Script to organize new gallery images for SERGIK EPK
# This script helps match new images to the expected filenames

GALLERY_DIR="web/public/images/gallery"
SOURCE_DIR="${1:-/Users/machd/Desktop/SERGIK PHOTOS}"

echo "🎨 SERGIK Gallery Image Organizer"
echo "=================================="
echo ""
echo "Source directory: $SOURCE_DIR"
echo "Gallery directory: $GALLERY_DIR"
echo ""

# Create gallery directory if it doesn't exist
mkdir -p "$GALLERY_DIR"

# List of expected new image filenames and descriptions
# Format: filename|description
image_list=(
  "club-neon-all-you-1.jpg|Club scene with neon ALL YOU graffiti and colorful finger lights"
  "dj-booth-lasers-1.jpg|DJ booth view with blue and red laser lights over dance floor"
  "desert-elated-1.jpg|SERGIK in desert with ELATED t-shirt overlooking mountains and lake"
  "dj-blue-mixer-1.jpg|SERGIK DJing with blue lighting and illuminated mixer controls"
  "portrait-supreme-nike-1.jpg|Full body portrait with Supreme hat and Nike Cortez sneakers"
  "performance-sergik-back-1.jpg|SERGIK performing from behind with SERGIK logo on shirt"
  "portrait-graffiti-wall-1.jpg|Portrait in front of graffiti-covered wall at night"
  "portrait-vault-green-1.jpg|Close-up portrait with green-lit vault door background"
  "performance-eye-led-1.jpg|DJ performance with large eye graphic on LED screen"
  "dj-gold-glasses-1.jpg|SERGIK DJing with gold-rimmed glasses and chain"
  "performance-green-haze-1.jpg|DJ performance with intense green lighting and haze"
  "dj-mixing-blue-1.jpg|SERGIK actively mixing with blue stage lighting"
  "portrait-smoking-graffiti-1.jpg|Portrait smoking in front of red-lit graffiti wall"
  "performance-hand-pattern-1.jpg|Close-up with hand over mouth and projected pattern"
  "performance-two-djs-1.jpg|Two DJs performing together with purple lighting"
  "portrait-group-three-1.jpg|Group photo of three people at concert with purple lighting"
  "portrait-festival-two-1.jpg|Two men at outdoor festival at night"
  "portrait-graffiti-crouch-1.jpg|Crouching portrait in front of graffiti wall"
  "performance-sergik-tent-1.jpg|SERGIK performing under bright tent structure"
  "portrait-offwhite-supreme-1.jpg|Portrait with Off-White jacket and Supreme hoodie"
  "performance-blue-hands-1.jpg|DJ hands on mixer with blue lighting"
)

echo "📋 Expected new images (${#image_list[@]} total):"
echo ""
for item in "${image_list[@]}"; do
  filename="${item%%|*}"
  description="${item#*|}"
  if [ -f "$GALLERY_DIR/$filename" ]; then
    echo "  ✅ $filename"
  else
    echo "  ⏳ $filename"
    echo "     $description"
  fi
done

echo ""
echo "📁 Current images in gallery:"
ls -1 "$GALLERY_DIR"/*.jpg "$GALLERY_DIR"/*.jpeg 2>/dev/null | wc -l | xargs echo "   Total:"

echo ""
echo "💡 To add new images:"
echo "   1. Place your image files in: $SOURCE_DIR"
echo "   2. Review the descriptions above"
echo "   3. Rename and copy them to: $GALLERY_DIR"
echo "   4. Use the exact filenames listed above"
echo ""
echo "   Example:"
echo "   cp \"$SOURCE_DIR/your-image.jpg\" \"$GALLERY_DIR/club-neon-all-you-1.jpg\""

