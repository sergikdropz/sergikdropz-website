#!/bin/bash

# Create preliminary mapping based on file characteristics
# This is a starting point - review and adjust as needed

GALLERY_DIR="web/public/images/gallery"

cat > image-mappings-preliminary.txt << 'EOFMAP'
# Preliminary Image Mappings
# REVIEW THESE CAREFULLY BEFORE RENAMING
# Format: OLD_FILENAME|NEW_FILENAME|NOTES
#
# Based on file sizes and characteristics:
# - Large files (2-5MB): Likely high-quality portraits or landscapes
# - Medium files (0.3-1.5MB): Performance shots, group photos
# - Small files (0.1-0.3MB): Close-ups, detail shots
#
# Dates: Most images from 2026-01-10 10:05 (same photo session)
# Two large files from 2024-11-03 (different session)

# Large files (likely portraits or landscapes)
# 1.JPG (5.16MB, Nov 2024) - Could be desert-elated-1 or portrait-supreme-nike-1
# 2.JPG (5.31MB, Nov 2024) - Could be portrait-supreme-nike-1 or desert-elated-1
# IMG_1519.jpeg (2.75MB) - Could be portrait or landscape
# IMG_2192.jpeg (1.52MB) - Could be group photo or performance

# Medium files (likely performances or group shots)
# IMG_5612.jpg (0.34MB) - Performance shot
# IMG_5629.jpg (0.26MB) - Performance shot
# IMG_2018.jpg (0.28MB) - Performance or portrait

# Small files (likely close-ups or detail shots)
# IMG_2011.jpg (0.13MB) - Close-up
# IMG_2014.jpg (0.15MB) - Close-up
# IMG_2022.jpg (0.14MB) - Close-up
# IMG_2023.jpg (0.14MB) - Close-up
# IMG_2025.jpg (0.09MB) - Very small, likely detail
# IMG_2026.jpg (0.06MB) - Very small, likely detail
# IMG_3353.jpg (0.20MB) - Close-up
# IMG_5043.jpeg (0.16MB) - Close-up
# IMG_5046.jpeg (0.09MB) - Very small
# IMG_5063.jpeg (0.13MB) - Close-up
# IMG_5798.jpg (0.20MB) - Close-up
# IMG_5800.jpg (0.18MB) - Close-up
# IMG_5801.jpg (0.10MB) - Small
# IMG_5809.jpg (0.16MB) - Close-up
# IMG_5826.jpeg (0.19MB) - Close-up

# PNG file
# IMG_0203.PNG (3.33MB) - Large, could be portrait or special effect

# NOTE: These are GUESSES - you must review visually to confirm!
# Uncomment and adjust lines below after reviewing images:

# Example (uncomment and adjust after review):
# IMG_2011.jpg|club-neon-all-you-1.jpg|Review: Does this show neon ALL YOU graffiti?
# IMG_2014.jpg|dj-booth-lasers-1.jpg|Review: Does this show DJ booth with lasers?
EOFMAP

echo "✅ Created image-mappings-preliminary.txt"
echo "📝 Review this file and create your final image-mappings.txt"
echo "💡 Then run: ./rename-gallery-images.sh"

