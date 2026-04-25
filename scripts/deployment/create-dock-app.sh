#!/bin/bash

# Create an AppleScript application that opens the SERGIK folder
# This app can then be added to the Dock

FOLDER_PATH="/Users/machd/Documents/SERGIK Web and app"
APP_NAME="SERGIK Project"
APP_PATH="$HOME/Applications/$APP_NAME.app"

echo "Creating Dock application..."

# Create the app bundle structure
mkdir -p "$APP_PATH/Contents/MacOS"
mkdir -p "$APP_PATH/Contents/Resources"

# Create the AppleScript
cat > "$APP_PATH/Contents/MacOS/applet" <<'APPLESCRIPT'
#!/usr/bin/osascript
tell application "Finder"
    set targetFolder to POSIX file "/Users/machd/Documents/SERGIK Web and app"
    open targetFolder
    activate
end tell
APPLESCRIPT

chmod +x "$APP_PATH/Contents/MacOS/applet"

# Create Info.plist
cat > "$APP_PATH/Contents/Info.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleExecutable</key>
    <string>applet</string>
    <key>CFBundleIdentifier</key>
    <string>com.sergik.project</string>
    <key>CFBundleName</key>
    <string>SERGIK Project</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>CFBundleVersion</key>
    <string>1.0</string>
    <key>CFBundleShortVersionString</key>
    <string>1.0</string>
</dict>
</plist>
EOF

echo ""
echo "✓ Application created at: $APP_PATH"
echo ""
echo "To add to Dock:"
echo "1. Open Finder and navigate to ~/Applications"
echo "2. Find '$APP_NAME' app"
echo "3. Drag it to your Dock"
echo ""
echo "Or run this command to open Applications folder:"
echo "open ~/Applications"

