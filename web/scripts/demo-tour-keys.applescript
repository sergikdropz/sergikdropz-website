-- ============================================================
-- SERGIKDROPZ Platform Tour — Pure AppleScript (no JS needed)
-- Uses URL navigation + Space/Arrow keys for scrolling
-- Works without "Allow JavaScript from Apple Events"
--
-- Usage:
--   osascript scripts/demo-tour-keys.applescript
-- ============================================================

property BASE_URL : "http://127.0.0.1:3001"

-- ── Helpers ────────────────────────────────────────────────────────────

on goTo(path, waitSec)
	tell application "Google Chrome"
		set URL of active tab of window 1 to BASE_URL & path
	end tell
	delay waitSec
end goTo

on scrollDown(scrollCount)
	tell application "System Events"
		tell process "Google Chrome"
			-- Click the page body first to ensure focus
			keystroke tab
			delay 0.3
			repeat scrollCount times
				key code 49 -- Space = page down
				delay 0.8
			end repeat
		end tell
	end tell
	delay 0.5
	-- Scroll back to top
	tell application "System Events"
		tell process "Google Chrome"
			key code 115 using command down -- Cmd+Home
		end tell
	end tell
	delay 0.8
end scrollDown

on showURL(path)
	-- Flash the URL bar so viewers can see where we are
	tell application "System Events"
		tell process "Google Chrome"
			keystroke "l" using command down
			delay 0.4
			keystroke escape
		end tell
	end tell
	delay 0.3
end showURL

-- ── Start ──────────────────────────────────────────────────────────────

tell application "Google Chrome"
	activate
	if (count of windows) = 0 then make new window
	set bounds of front window to {0, 25, 1440, 925}
end tell
delay 1.5

-- ══════════════════════════════════════════════════════
-- SECTION 1 — PUBLIC FAN EXPERIENCE
-- ══════════════════════════════════════════════════════

-- Stop 1: Homepage
goTo("/", 4)
scrollDown(3)

-- Stop 2: Music Catalog
goTo("/music", 4)
scrollDown(3)

-- Stop 3: Sonic DNA Search (new feature — linger here)
goTo("/music/search", 3)
delay 1
-- Simulate typing "dark" in the search box
tell application "System Events"
	tell process "Google Chrome"
		-- Tab to the search input
		keystroke tab
		delay 0.4
		keystroke "dark"
		delay 2
	end tell
end tell
scrollDown(2)
-- Clear and show BPM filter
goTo("/music/search?bpm_min=125&bpm_max=135", 3)
delay 2
scrollDown(2)
-- Clear to all
goTo("/music/search", 3)
delay 2

-- Stop 4: Track detail
goTo("/music", 3)
delay 1
-- Click the first music link using keyboard
tell application "System Events"
	tell process "Google Chrome"
		keystroke tab
		delay 0.3
		keystroke tab
		delay 0.3
		key code 36 -- Return to follow first link
	end tell
end tell
delay 3
scrollDown(2)

-- Stop 5: Gallery
goTo("/gallery", 4)
scrollDown(3)

-- Stop 6: Videos
goTo("/videos", 4)
scrollDown(2)

-- Stop 7: Performances
goTo("/performances", 3)
scrollDown(2)

-- Stop 8: EPK
goTo("/epk", 3)
scrollDown(3)

-- ══════════════════════════════════════════════════════
-- SECTION 2 — COMMERCE
-- ══════════════════════════════════════════════════════

-- Stop 9: Shop
goTo("/shop", 4)
scrollDown(3)

-- Stop 10: Merch
goTo("/shop/merch", 4)
scrollDown(3)

-- Stop 11: Tip
goTo("/shop/tip", 3)
scrollDown(2)

-- Stop 12: Membership
goTo("/shop/membership", 4)
scrollDown(3)

-- Stop 13: Music Library Vault
goTo("/music-library", 4)
scrollDown(3)

-- ══════════════════════════════════════════════════════
-- SECTION 3 — FAN ACCOUNT
-- ══════════════════════════════════════════════════════

-- Stop 14: Fan page
goTo("/fan", 3)
scrollDown(2)

-- Stop 15: Follow
goTo("/follow", 3)
scrollDown(2)

-- Stop 16: Fan register
goTo("/fan/register", 3)
scrollDown(2)

-- ══════════════════════════════════════════════════════
-- SECTION 4 — ADMIN (requires manual login)
-- ══════════════════════════════════════════════════════

-- Navigate to admin login — admin must already be logged in
-- or credentials will be needed
goTo("/admin", 4)

-- If redirected to login, pause here
-- (If already logged in from browser session, continues to dashboard)
delay 2

goTo("/admin/analytics", 4)
scrollDown(3)

goTo("/admin/tools/fan-journey", 5)
scrollDown(2)

goTo("/admin/subscribers", 3)
scrollDown(2)

goTo("/admin/nurturing", 4)
scrollDown(2)

goTo("/admin/nurturing/campaigns", 3)
scrollDown(2)

goTo("/admin/music-library", 4)
scrollDown(3)

goTo("/admin/sonic-dna", 5)
scrollDown(3)

goTo("/admin/releases", 4)
scrollDown(2)

goTo("/admin/purchases", 3)
scrollDown(2)

goTo("/admin/memberships", 3)
scrollDown(2)

goTo("/admin/instagram", 4)
scrollDown(2)

goTo("/admin/settings", 3)
scrollDown(2)

goTo("/admin/ai-assistant/window", 5)
scrollDown(2)

-- ══════════════════════════════════════════════════════
-- SECTION 5 — STUDIO
-- ══════════════════════════════════════════════════════

goTo("/studio/releases/command-center", 4)
scrollDown(2)

goTo("/studio/releases/calendar", 4)
scrollDown(2)

goTo("/studio/releases/new", 4)
scrollDown(3)

goTo("/studio/soundexchange", 4)
scrollDown(2)

-- ══════════════════════════════════════════════════════
-- CLOSING
-- ══════════════════════════════════════════════════════

goTo("/", 5)
scrollDown(2)
delay 3
