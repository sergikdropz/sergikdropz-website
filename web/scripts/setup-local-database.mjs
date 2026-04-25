#!/usr/bin/env node

/**
 * Set up local database connection and utilities
 * Creates a local database client that can work with exported data
 */

import { readFile, writeFile } from 'fs/promises'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { existsSync } from 'fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const DATA_DIR = join(__dirname, '../data/supabase-export')
const LOCAL_DB_FILE = join(__dirname, '../lib/local-db.ts')

async function createLocalDBClient() {
  const template = `/**
 * Local Database Client
 * Works with exported Supabase data stored in JSON files
 * Use this for local development without Supabase connection
 */

import { readFile } from 'fs/promises'
import { join } from 'path'

const DATA_DIR = join(process.cwd(), 'data/supabase-export')

interface LocalDBOptions {
  table: string
  filters?: Record<string, any>
  limit?: number
  offset?: number
  orderBy?: string
  orderDirection?: 'asc' | 'desc'
}

export class LocalDB {
  private static async loadTable(tableName: string) {
    try {
      const filePath = join(DATA_DIR, \`\${tableName}.json\`)
      const data = await readFile(filePath, 'utf-8')
      return JSON.parse(data)
    } catch (error) {
      console.error(\`Error loading table \${tableName}:\`, error)
      return []
    }
  }

  static async query<T = any>(options: LocalDBOptions): Promise<T[]> {
    const { table, filters, limit, offset = 0, orderBy, orderDirection = 'asc' } = options
    
    let data = await this.loadTable(table)
    
    // Apply filters
    if (filters) {
      data = data.filter((item: any) => {
        return Object.entries(filters).every(([key, value]) => {
          if (value === undefined || value === null) return true
          if (typeof value === 'string') {
            return item[key]?.toString().toLowerCase().includes(value.toLowerCase())
          }
          return item[key] === value
        })
      })
    }
    
    // Apply sorting
    if (orderBy) {
      data.sort((a: any, b: any) => {
        const aVal = a[orderBy]
        const bVal = b[orderBy]
        if (orderDirection === 'asc') {
          return aVal > bVal ? 1 : aVal < bVal ? -1 : 0
        } else {
          return aVal < bVal ? 1 : aVal > bVal ? -1 : 0
        }
      })
    }
    
    // Apply pagination
    if (offset > 0) {
      data = data.slice(offset)
    }
    if (limit) {
      data = data.slice(0, limit)
    }
    
    return data as T[]
  }

  static async findById<T = any>(table: string, id: string): Promise<T | null> {
    const data = await this.loadTable(table)
    return data.find((item: any) => item.id === id) || null
  }

  static async count(table: string, filters?: Record<string, any>): Promise<number> {
    const data = await this.query({ table, filters })
    return data.length
  }

  static async getAll<T = any>(table: string): Promise<T[]> {
    return this.loadTable(table) as T[]
  }
}

// Convenience methods matching Supabase API
export const localDB = {
  from: (table: string) => ({
    select: (columns = '*') => ({
      eq: (column: string, value: any) => ({
        single: async () => {
          const data = await LocalDB.query({ table, filters: { [column]: value } })
          return { data: data[0] || null, error: null }
        },
        data: async () => {
          const data = await LocalDB.query({ table, filters: { [column]: value } })
          return { data, error: null }
        }
      }),
      data: async () => {
        const data = await LocalDB.getAll(table)
        return { data, error: null }
      }
    }),
    insert: async (values: any) => {
      console.warn('LocalDB: insert() is read-only. Use import script to update data.')
      return { data: null, error: { message: 'LocalDB is read-only' } }
    },
    update: async (values: any) => {
      console.warn('LocalDB: update() is read-only. Use import script to update data.')
      return { data: null, error: { message: 'LocalDB is read-only' } }
    },
    delete: async () => {
      console.warn('LocalDB: delete() is read-only. Use import script to update data.')
      return { data: null, error: { message: 'LocalDB is read-only' } }
    }
  })
}

export default LocalDB
`

  await writeFile(LOCAL_DB_FILE, template, 'utf-8')
  console.log(`✅ Created local database client: ${LOCAL_DB_FILE}`)
}

async function main() {
  console.log('🔧 Setting up local database utilities...\n')
  
  try {
    // Check if export directory exists
    if (!existsSync(DATA_DIR)) {
      console.log('⚠️  Export directory does not exist yet.')
      console.log('   Run "node scripts/export-supabase-to-local.mjs" first to export data.')
    } else {
      console.log(`✅ Export directory exists: ${DATA_DIR}`)
    }
    
    // Create local DB client
    await createLocalDBClient()
    
    console.log('\n✅ Local database setup complete!')
    console.log('\n📝 Usage:')
    console.log('   1. Export data: node scripts/export-supabase-to-local.mjs')
    console.log('   2. Use LocalDB in your code: import { LocalDB } from "@/lib/local-db"')
    console.log('   3. Import back: node scripts/import-local-to-supabase.mjs')
    
  } catch (error) {
    console.error('❌ Setup failed:', error)
    process.exit(1)
  }
}

main()

