import { spawn } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'

/** Paths under web/e2e only, POSIX-style. */
const SAFE_SPEC = /^e2e\/[a-zA-Z0-9/_-]+\.spec\.ts$/

const MAX_APPLESCRIPT_CHARS = 32_000
const PLAYWRIGHT_MAX_MS = 10 * 60_000
const TRUNC = 24_000

const APPLE_UNSAFE =
  /\b(sudo|rm\s+-rf|curl\s|wget\s|nc\s|\/bin\/bash|\/bin\/sh|>[\s&]|;\s*rm|mkfs|dd\s+if=|:\(\)\{)/i

export function isPlaywrightAdminToolEnabled(): boolean {
  const v = process.env.ADMIN_AI_PLAYWRIGHT_ENABLED?.trim().toLowerCase()
  return v === '1' || v === 'true' || v === 'yes'
}

export function isAppleScriptAdminToolEnabled(): boolean {
  const v = process.env.ADMIN_AI_APPLESCRIPT_ENABLED?.trim().toLowerCase()
  return v === '1' || v === 'true' || v === 'yes'
}

function resolveWebProjectRoot(): string {
  const cwd = process.cwd()
  if (fs.existsSync(path.join(cwd, 'playwright.config.ts'))) return cwd
  const nested = path.join(cwd, 'web')
  if (fs.existsSync(path.join(nested, 'playwright.config.ts'))) return nested
  throw new Error('Could not find playwright.config.ts (expected in cwd or web/)')
}

function baseUrlForPlaywright(): string {
  return (
    process.env.PLAYWRIGHT_BASE_URL?.trim() ||
    process.env.PLAYWRIGHT_E2E_BASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    'http://127.0.0.1:3001'
  )
}

function validateSpecFile(webRoot: string, spec: string) {
  if (!SAFE_SPEC.test(spec)) {
    throw new Error(`Invalid spec path (allowed: e2e/**/*.spec.ts): ${spec}`)
  }
  const abs = path.join(webRoot, spec)
  const resolved = path.resolve(abs)
  const e2eRoot = path.resolve(webRoot, 'e2e')
  if (!resolved.startsWith(e2eRoot + path.sep) && resolved !== e2eRoot) {
    throw new Error('Spec path escapes e2e directory')
  }
  if (!fs.existsSync(resolved)) {
    throw new Error(`Spec file not found: ${spec}`)
  }
}

function truncate(s: string, max: number) {
  if (s.length <= max) return s
  return `${s.slice(0, max - 1)}…`
}

type PlaywrightResult = {
  spec: string
  project: string
  baseURL: string
  exitCode: number | null
  durationMs: number
  stdout: string
  stderr: string
  command: string[]
  dryRun: boolean
  skipped?: string
}

/**
 * Run a single allowed Playwright spec file against an existing dev server
 * (sets PLAYWRIGHT_NO_WEB_SERVER=1). Requires ADMIN_AI_PLAYWRIGHT_ENABLED for non-dry runs.
 */
export async function executePlaywrightE2E(params: {
  spec?: string
  project?: string
  grep?: string
  dryRun: boolean
}): Promise<PlaywrightResult> {
  const webRoot = resolveWebProjectRoot()
  const spec = (params.spec && String(params.spec).trim()) || 'e2e/admin-guest.spec.ts'
  validateSpecFile(webRoot, spec)

  const project =
    (params.project && String(params.project).trim()) ||
    (spec.includes('admin-guest') || spec.includes('admin-a11y') || spec.includes('fan-public')
      ? 'chromium-guest'
      : 'chromium-guest')
  const grep = params.grep?.trim() ? String(params.grep) : undefined

  const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx'
  const args = ['playwright', 'test', spec, '--project', project, '--reporter=list']
  if (grep) {
    args.push('--grep', grep)
  }
  const command = [npx, ...args]

  const baseURL = baseUrlForPlaywright()
  const env = {
    ...process.env,
    PLAYWRIGHT_NO_WEB_SERVER: '1',
    PLAYWRIGHT_BASE_URL: baseURL,
    CI: process.env.CI || '1',
  } as NodeJS.ProcessEnv

  if (params.dryRun) {
    return {
      spec,
      project,
      baseURL,
      exitCode: null,
      durationMs: 0,
      stdout: '',
      stderr: '',
      command,
      dryRun: true,
      skipped: isPlaywrightAdminToolEnabled() ? 'preview only' : 'set ADMIN_AI_PLAYWRIGHT_ENABLED=1 to run',
    }
  }

  if (!isPlaywrightAdminToolEnabled()) {
    throw new Error('Playwright E2E tool is disabled. Set ADMIN_AI_PLAYWRIGHT_ENABLED=1 in the server environment.')
  }

  const t0 = Date.now()
  const { code, stdout, stderr } = await runCommand(npx, args, {
    cwd: webRoot,
    env,
    maxMs: PLAYWRIGHT_MAX_MS,
  })
  const durationMs = Date.now() - t0

  if (code !== 0) {
    const detail = `${stderr}\n${stdout}`.trim()
    throw new Error(`Playwright failed (exit ${code}): ${truncate(detail, 10_000)}`)
  }

  return {
    spec,
    project,
    baseURL,
    exitCode: code,
    durationMs,
    stdout: truncate(stdout, TRUNC),
    stderr: truncate(stderr, TRUNC),
    command,
    dryRun: false,
  }
}

type AppleResult = {
  result: string
  durationMs: number
  dryRun: boolean
  platform: string
  skipped?: string
}

function assertAppleScriptSafe(script: string) {
  if (script.length > MAX_APPLESCRIPT_CHARS) {
    throw new Error(`Script exceeds max length (${MAX_APPLESCRIPT_CHARS} chars)`)
  }
  if (APPLE_UNSAFE.test(script)) {
    throw new Error('Script matched safety blocklist (no shell exfil, sudo, or destructive patterns)')
  }
}

export async function executeAppleScript(params: { script: string; dryRun: boolean }): Promise<AppleResult> {
  const platform = process.platform
  if (platform !== 'darwin') {
    if (params.dryRun) {
      return {
        result: '',
        durationMs: 0,
        dryRun: true,
        platform,
        skipped: 'AppleScript runs only on macOS when executing (preview OK on any OS)',
      }
    }
    throw new Error('AppleScript tool runs only on macOS (darwin)')
  }
  const script = String(params.script ?? '').trim()
  if (!script) {
    throw new Error('Missing required field: script')
  }
  assertAppleScriptSafe(script)

  if (params.dryRun) {
    return {
      result: '',
      durationMs: 0,
      dryRun: true,
      platform,
      skipped: isAppleScriptAdminToolEnabled() ? 'preview only' : 'set ADMIN_AI_APPLESCRIPT_ENABLED=1 to run',
    }
  }

  if (!isAppleScriptAdminToolEnabled()) {
    throw new Error('AppleScript tool is disabled. Set ADMIN_AI_APPLESCRIPT_ENABLED=1 in the server environment.')
  }

  const t0 = Date.now()
  const { stdout, stderr, code } = await runCommand('osascript', ['-e', script], {
    maxMs: 120_000,
  })
  const durationMs = Date.now() - t0
  const out = [stdout, stderr].filter(Boolean).join('\n').trim() || (code === 0 ? 'ok' : '')
  if (code !== 0) {
    throw new Error(`AppleScript failed (exit ${code}): ${truncate(out, 4000)}`)
  }
  return { result: truncate(out, TRUNC), durationMs, dryRun: false, platform }
}

function runCommand(
  cmd: string,
  args: string[],
  opts: { cwd?: string; env?: NodeJS.ProcessEnv; maxMs: number }
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: opts.cwd,
      env: opts.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    const onData = (buf: Buffer, which: 'stdout' | 'stderr') => {
      const s = buf.toString()
      if (which === 'stdout') stdout += s
      else stderr += s
    }
    child.stdout?.on('data', (d) => onData(d, 'stdout'))
    child.stderr?.on('data', (d) => onData(d, 'stderr'))
    const timer = setTimeout(() => {
      child.kill('SIGTERM')
      reject(new Error(`Command timed out after ${opts.maxMs}ms: ${cmd} ${args.join(' ')}`))
    }, opts.maxMs)
    child.on('error', (e) => {
      clearTimeout(timer)
      reject(e)
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ code, stdout, stderr })
    })
  })
}
