import { execFileSync } from 'node:child_process'

function escapeAppleScript(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

export function runAppleScript(source) {
  return execFileSync('osascript', ['-e', source], { encoding: 'utf8' }).trim()
}

/** Bring headed Playwright Chrome to the front on macOS. */
export function activateBrowser(channel = 'chrome') {
  const app = channel === 'chrome' ? 'Google Chrome' : 'Chromium'
  try {
    runAppleScript(`tell application "${app}" to activate`)
  } catch {
    runAppleScript('tell application "System Events" to set frontmost of first process whose name contains "Chrome" to true')
  }
}

export function notify(title, message) {
  try {
    runAppleScript(
      `display notification "${escapeAppleScript(message)}" with title "${escapeAppleScript(title)}"`,
    )
  } catch {
    // non-macOS or permissions
  }
}

/** macOS dialog — returns button label ("OK", "Cancel", …). */
export function dialog(message, { title = 'SERGIK R2 Setup', buttons = ['OK'] } = {}) {
  const btnList = buttons.map((b) => `"${escapeAppleScript(b)}"`).join(', ')
  return runAppleScript(
    `button returned of (display dialog "${escapeAppleScript(message)}" with title "${escapeAppleScript(title)}" buttons {${btnList}} default button 1)`,
  )
}

/** Prompt for a single secret/value (Cancel → empty string). */
export function promptText(message, { title = 'SERGIK R2 Setup', defaultAnswer = '' } = {}) {
  try {
    return runAppleScript(
      `text returned of (display dialog "${escapeAppleScript(message)}" with title "${escapeAppleScript(title)}" default answer "${escapeAppleScript(defaultAnswer)}" buttons {"Cancel", "OK"} default button "OK")`,
    )
  } catch {
    return ''
  }
}

export function copyToClipboard(text) {
  runAppleScript(`set the clipboard to "${escapeAppleScript(text)}"`)
}
