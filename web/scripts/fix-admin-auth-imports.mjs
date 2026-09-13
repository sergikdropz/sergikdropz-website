#!/usr/bin/env node
/**
 * Admin auth hardening: use AdminAuthContext and remove client login redirects
 * (middleware + protected layout are the single gate).
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const adminProtected = path.join(root, 'app/admin/(protected)')

const REDIRECT_EFFECT =
  /\n\s*useEffect\(\(\) => \{\s*\n\s*if \(!loading && \(!user \|\| !isAdmin\)\) \{\s*\n\s*router\.(push|replace)\(['`]\/admin\/login['`]\)\s*\n\s*\}\s*\n\s*\}, \[[^\]]*\]\)\s*/g

const REDIRECT_EFFECT_LOADING_ONLY =
  /\n\s*useEffect\(\(\) => \{\s*\n\s*if \(loading\) return\s*\n\s*if \(!user \|\| !isAdmin\) \{\s*\n\s*router\.(push|replace)\(['`]\/admin\/login['`]\)\s*\n\s*\}\s*\n\s*\}, \[[^\]]*\]\)\s*/g

const REDIRECT_ONE_LINER =
  /\n\s*if \(!loading && \(!user \|\| !isAdmin\)\) router\.(push|replace)\(['`]\/admin\/login['`]\)\s*/g

function walk(dir, files = []) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name)
    if (fs.statSync(full).isDirectory()) walk(full, files)
    else if (/\.(tsx|ts)$/.test(name)) files.push(full)
  }
  return files
}

let changed = 0
for (const file of walk(adminProtected)) {
  let src = fs.readFileSync(file, 'utf8')
  const before = src

  src = src.replace(
    /from '@\/contexts\/AuthContext'/g,
    "from '@/contexts/AdminAuthContext'"
  )
  src = src.replace(
    /import \{ useAuth \}/g,
    'import { useAdminAuth }'
  )
  src = src.replace(/\buseAuth\(\)/g, 'useAdminAuth()')

  src = src.replace(REDIRECT_EFFECT, '\n')
  src = src.replace(REDIRECT_EFFECT_LOADING_ONLY, '\n')
  src = src.replace(REDIRECT_ONE_LINER, '\n')

  if (src !== before) {
    fs.writeFileSync(file, src)
    changed++
    console.log('updated', path.relative(root, file))
  }
}

console.log(`Done. ${changed} files updated.`)
