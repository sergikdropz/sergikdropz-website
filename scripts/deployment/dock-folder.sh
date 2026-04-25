#!/bin/bash

# Script to add the SERGIK project folder to macOS Dock

FOLDER_PATH="/Users/machd/Documents/SERGIK Web and app"
FOLDER_NAME="SERGIK Web and app"

echo "Adding folder to Dock..."

# Method 1: Using AppleScript to add to Dock
osascript <<EOF
tell application "System Events"
    tell application "Finder"
        set targetFolder to POSIX file "$FOLDER_PATH"
        set folderAlias to make alias file to targetFolder at desktop
        set aliasName to name of folderAlias
    end tell
end tell

tell application "Dock"
    activate
end tell

-- Open Finder to show the alias so user can drag it to Dock
tell application "Finder"
    activate
    reveal POSIX file "$FOLDER_PATH"
end tell

EOF

echo ""
echo "✓ Folder opened in Finder"
echo ""
echo "To add to Dock:"
echo "1. Drag the folder icon from the Finder window title bar"
echo "2. Drop it onto the Dock (on the right side, near the Trash)"
echo ""
echo "Alternatively, you can:"
echo "- Right-click the folder in Finder → Services → Add to Dock (if available)"
echo "- Or manually drag the folder from Finder sidebar to Dock"

