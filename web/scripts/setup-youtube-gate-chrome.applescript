-- Opens Google Cloud setup tabs in the user's signed-in Chrome session.
-- Pair with: cd web && npm run setup:youtube-subscribe-gate

display notification "Create API key + OAuth Web client, then complete the setup dialogs." with title "SERGIK YouTube Gate"

tell application "Google Chrome"
	activate
	if (count of windows) = 0 then make new window
	set URL of active tab of window 1 to "https://console.cloud.google.com/apis/library/youtube.googleapis.com"
	delay 0.4
	make new tab at end of window 1
	set URL of active tab of window 1 to "https://console.cloud.google.com/apis/credentials/oauthclient"
	delay 0.4
	make new tab at end of window 1
	set URL of active tab of window 1 to "https://console.cloud.google.com/apis/credentials"
end tell

set dlgResult to button returned of (display dialog "In Chrome (signed in):

1) Enable YouTube Data API v3
2) Credentials → Create API key
3) Create OAuth client → Web application
   Redirect URIs:
   • https://sergikdropz.com/api/youtube/subscribe-gate/callback
   • http://localhost:3001/api/youtube/subscribe-gate/callback
   Origins: https://sergikdropz.com and http://localhost:3001

When done, click OK — Terminal will ask for the three secrets." buttons {"Cancel", "OK"} default button "OK")

if dlgResult is "OK" then
	set webRoot to (POSIX path of (path to home folder)) & "Documents/SERGIK Web and app/web"
	do shell script "cd " & quoted form of webRoot & " && npm run setup:youtube-subscribe-gate"
end if
