import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export function localWhisperArgs(audioPath: string, outputDir: string): string[] {
  return [
    audioPath,
    '--model',
    'base',
    '--language',
    'English',
    '--task',
    'transcribe',
    '--output_format',
    'txt',
    '--output_dir',
    outputDir,
    '--fp16',
    'False',
    '--verbose',
    'False',
  ]
}

function whisperPathEnv(): NodeJS.ProcessEnv {
  const home = process.env.HOME
  return {
    ...process.env,
    PATH: [process.env.PATH, home ? `${home}/.pyenv/shims` : '', home ? `${home}/.pyenv/bin` : '', '/opt/homebrew/bin']
      .filter(Boolean)
      .join(':'),
  }
}

/** On-device Whisper CLI. Used when OPENAI_API_KEY is unset. */
export async function transcribeWithLocalWhisper(bytes: Buffer, filename: string): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'sergik-dictation-'))
  const stem = path.basename(filename).replace(/[^a-zA-Z0-9._-]/g, '') || 'dictation.webm'
  const audioPath = path.join(dir, stem.includes('.') ? stem : `${stem}.webm`)
  try {
    await writeFile(audioPath, bytes)
    await execFileAsync('whisper', localWhisperArgs(audioPath, dir), {
      env: whisperPathEnv(),
      timeout: 90_000,
      maxBuffer: 8 * 1024 * 1024,
    })
    const text = (await readFile(audioPath.replace(/\.[^.]+$/, '.txt'), 'utf8')).trim()
    if (!text) throw new Error('Empty transcription result')
    return text
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : ''
    if (code === 'ENOENT') {
      throw new Error('Talk to text needs OPENAI_API_KEY or the local whisper command.')
    }
    const stderr =
      error && typeof error === 'object' && 'stderr' in error ? String((error as { stderr?: unknown }).stderr || '') : ''
    const detail = stderr
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(-2)
      .join(' ')
    if (detail) throw new Error(`Transcription failed: ${detail.slice(0, 240)}`)
    throw error
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}
