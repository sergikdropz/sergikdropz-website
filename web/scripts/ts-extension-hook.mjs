import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

/** Lets the reminder script import extensionless TypeScript modules. */
export async function resolve(specifier, context, nextResolve) {
  if (
    (specifier.startsWith('./') || specifier.startsWith('../')) &&
    !path.extname(specifier) &&
    context.parentURL
  ) {
    const base = path.resolve(path.dirname(fileURLToPath(context.parentURL)), specifier)
    for (const ext of ['.ts', '.tsx', '.js', '.mjs']) {
      if (existsSync(`${base}${ext}`)) {
        return nextResolve(pathToFileURL(`${base}${ext}`).href, context)
      }
    }
  }
  return nextResolve(specifier, context)
}
