'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useRouter } from 'next/navigation'

interface TableInfo {
  name: string
  schema: string
  row_count?: number
  rowCount?: number
  size_bytes?: number | null
  sizeBytes?: number | null
  size_formatted?: string
  sizeFormatted?: string
  columns?: ColumnInfo[]
}

interface ColumnInfo {
  name: string
  type: string
  nullable: boolean
  defaultValue: string | null
  isPrimaryKey: boolean
}

interface TableDataResponse {
  rows: Record<string, any>[]
  totalRows: number
  page: number
  pageSize: number
  totalPages: number
}

interface ContextMenuState {
  x: number
  y: number
  row: Record<string, any>
  rowIndex: number
}

interface EditModalState {
  row: Record<string, any>
  isNew: boolean
}

type Tab = 'tables' | 'browser' | 'query'

export default function AdminDatabase() {
  const { user, isAdmin, loading } = useAuth()
  const router = useRouter()
  const [tables, setTables] = useState<TableInfo[]>([])
  const [loadingTables, setLoadingTables] = useState(true)
  const [mode, setMode] = useState<string>('')
  const [activeTab, setActiveTab] = useState<Tab>('tables')
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  const [selectedTable, setSelectedTable] = useState<string | null>(null)
  const [tableData, setTableData] = useState<TableDataResponse | null>(null)
  const [loadingData, setLoadingData] = useState(false)
  const [browserPage, setBrowserPage] = useState(1)
  const [orderBy, setOrderBy] = useState<string | undefined>(undefined)
  const [orderDir, setOrderDir] = useState<'asc' | 'desc'>('desc')
  const [searchFilter, setSearchFilter] = useState('')

  const [sqlQuery, setSqlQuery] = useState('SELECT * FROM audio_files LIMIT 10;')
  const [queryResult, setQueryResult] = useState<any[] | null>(null)
  const [queryError, setQueryError] = useState<string | null>(null)
  const [runningQuery, setRunningQuery] = useState(false)
  const [queryTime, setQueryTime] = useState<number | null>(null)

  const [expandedTable, setExpandedTable] = useState<string | null>(null)

  // Context menu + edit state
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [editModal, setEditModal] = useState<EditModalState | null>(null)
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<Record<string, any> | null>(null)
  const contextMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!loading && (!user || !isAdmin)) router.push('/admin/login')
  }, [user, isAdmin, loading, router])

  useEffect(() => {
    if (isAdmin) fetchTables()
  }, [isAdmin])

  // Dismiss context menu on click outside or Escape
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(null)
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setContextMenu(null)
        setEditModal(null)
        setConfirmDelete(null)
      }
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [])

  // Auto-clear success messages
  useEffect(() => {
    if (successMsg) {
      const t = setTimeout(() => setSuccessMsg(null), 3000)
      return () => clearTimeout(t)
    }
  }, [successMsg])

  async function fetchTables() {
    try {
      setLoadingTables(true)
      setError(null)
      const res = await fetch('/api/admin/database')
      const data = await res.json()
      if (data.error) { setError(data.error); return }
      setTables(data.tables || [])
      setMode(data.mode || '')
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoadingTables(false)
    }
  }

  const fetchTableData = useCallback(async (tableName: string, page = 1) => {
    try {
      setLoadingData(true)
      const res = await fetch('/api/admin/database', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'table-data',
          query: { tableName, page, pageSize: 50, orderBy, orderDir, search: searchFilter || undefined },
        }),
      })
      const data = await res.json()
      if (data.error) { setError(data.error); return }
      setTableData(data)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoadingData(false)
    }
  }, [orderBy, orderDir, searchFilter])

  function openTableBrowser(tableName: string) {
    setSelectedTable(tableName)
    setBrowserPage(1)
    setOrderBy(undefined)
    setOrderDir('desc')
    setSearchFilter('')
    setActiveTab('browser')
    fetchTableData(tableName, 1)
  }

  useEffect(() => {
    if (selectedTable && activeTab === 'browser') fetchTableData(selectedTable, browserPage)
  }, [browserPage, orderBy, orderDir, selectedTable, activeTab, fetchTableData])

  async function runQuery() {
    if (!sqlQuery.trim()) return
    try {
      setRunningQuery(true); setQueryError(null); setQueryResult(null)
      const start = performance.now()
      const res = await fetch('/api/admin/database', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'query', query: { sql: sqlQuery } }),
      })
      const elapsed = performance.now() - start
      const data = await res.json()
      setQueryTime(Math.round(elapsed))
      if (data.error) { setQueryError(data.error); return }
      setQueryResult(data.rows || [])
    } catch (err: any) {
      setQueryError(err.message)
    } finally {
      setRunningQuery(false)
    }
  }

  function handleSort(column: string) {
    if (orderBy === column) setOrderDir(orderDir === 'asc' ? 'desc' : 'asc')
    else { setOrderBy(column); setOrderDir('asc') }
    setBrowserPage(1)
  }

  function getRowCount(t: TableInfo) { return t.row_count ?? t.rowCount ?? 0 }
  function getSizeFormatted(t: TableInfo) { return t.size_formatted ?? t.sizeFormatted ?? 'N/A' }
  function getColumns(t: TableInfo) { return t.columns || [] }

  function getIdColumn(row: Record<string, any>): string {
    const keys = Object.keys(row)
    if (keys.includes('id')) return 'id'
    const pk = keys.find((k) => k.endsWith('_id') || k === 'uuid')
    return pk || keys[0]
  }

  // --- Write operations ---

  async function handleUpdateRow(original: Record<string, any>, updates: Record<string, any>) {
    if (!selectedTable) return
    const idCol = getIdColumn(original)
    try {
      setSaving(true)
      const res = await fetch('/api/admin/database', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update-row',
          query: { tableName: selectedTable, rowId: original[idCol], idColumn: idCol, updates },
        }),
      })
      const data = await res.json()
      if (data.error) { setError(data.error); return }
      setSuccessMsg('Row updated successfully')
      setEditModal(null)
      fetchTableData(selectedTable, browserPage)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDeleteRow(row: Record<string, any>) {
    if (!selectedTable) return
    const idCol = getIdColumn(row)
    try {
      setSaving(true)
      const res = await fetch('/api/admin/database', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'delete-row',
          query: { tableName: selectedTable, rowId: row[idCol], idColumn: idCol },
        }),
      })
      const data = await res.json()
      if (data.error) { setError(data.error); return }
      setSuccessMsg('Row deleted')
      setConfirmDelete(null)
      fetchTableData(selectedTable, browserPage)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDuplicateRow(row: Record<string, any>) {
    if (!selectedTable) return
    const idCol = getIdColumn(row)
    try {
      setSaving(true)
      const res = await fetch('/api/admin/database', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'duplicate-row',
          query: { tableName: selectedTable, rowId: row[idCol], idColumn: idCol },
        }),
      })
      const data = await res.json()
      if (data.error) { setError(data.error); return }
      setSuccessMsg('Row duplicated')
      fetchTableData(selectedTable, browserPage)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleInsertRow(row: Record<string, any>) {
    if (!selectedTable) return
    try {
      setSaving(true)
      const res = await fetch('/api/admin/database', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'insert-row',
          query: { tableName: selectedTable, row },
        }),
      })
      const data = await res.json()
      if (data.error) { setError(data.error); return }
      setSuccessMsg('Row inserted')
      setEditModal(null)
      fetchTableData(selectedTable, browserPage)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  function handleRowContextMenu(e: React.MouseEvent, row: Record<string, any>, rowIndex: number) {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY, row, rowIndex })
  }

  function handleCopyRow(row: Record<string, any>) {
    navigator.clipboard.writeText(JSON.stringify(row, null, 2))
    setSuccessMsg('Row JSON copied to clipboard')
    setContextMenu(null)
  }

  function handleCopyCell(value: any) {
    const str = value === null ? 'null' : typeof value === 'object' ? JSON.stringify(value) : String(value)
    navigator.clipboard.writeText(str)
    setSuccessMsg('Cell value copied')
    setContextMenu(null)
  }

  const totalRows = tables.reduce((sum, t) => sum + getRowCount(t), 0)
  const totalTables = tables.length

  if (loading || !isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <div className="text-white text-xl">Loading...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black text-white p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2">Database</h1>
          <p className="text-gray-400">Browse tables, inspect schemas, and manage data</p>
        </div>

        {/* Toast messages */}
        {successMsg && (
          <div className="fixed top-6 right-6 z-50 bg-green-900/90 border border-green-700 text-green-200 px-5 py-3 rounded-lg shadow-xl animate-fade-in">
            {successMsg}
          </div>
        )}

        {error && (
          <div className="bg-red-900/30 border border-red-700 rounded-lg p-4 mb-6 text-red-300">
            {error}
            <button onClick={() => setError(null)} className="ml-4 text-red-400 hover:text-red-200">Dismiss</button>
          </div>
        )}

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-lg p-5">
            <div className="text-sm text-gray-400 mb-1">Tables</div>
            <div className="text-3xl font-bold text-purple-400">{totalTables}</div>
          </div>
          <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-lg p-5">
            <div className="text-sm text-gray-400 mb-1">Total Rows</div>
            <div className="text-3xl font-bold text-blue-400">{totalRows.toLocaleString()}</div>
          </div>
          <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-lg p-5">
            <div className="text-sm text-gray-400 mb-1">Data Source</div>
            <div className="text-3xl font-bold text-green-400 capitalize">{mode || 'loading...'}</div>
            <div className="text-xs text-gray-500 mt-1">
              {mode === 'rpc' ? 'Full metadata via SQL functions' : 'Row counts via Supabase client'}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex space-x-1 bg-gray-900/30 border border-gray-800 rounded-lg p-1 mb-6">
          {(['tables', 'browser', 'query'] as Tab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-2.5 px-4 rounded-md text-sm font-medium transition ${
                activeTab === tab
                  ? 'bg-purple-600 text-white'
                  : 'text-gray-400 hover:text-white hover:bg-gray-800/50'
              }`}
            >
              {tab === 'tables' && 'Tables & Schema'}
              {tab === 'browser' && 'Data Browser'}
              {tab === 'query' && 'SQL Query'}
            </button>
          ))}
        </div>

        {/* ============ Tables & Schema Tab ============ */}
        {activeTab === 'tables' && (
          <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-lg p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-semibold">Tables</h2>
              <button
                onClick={fetchTables}
                disabled={loadingTables}
                className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg transition text-sm disabled:opacity-50"
              >
                {loadingTables ? 'Loading...' : 'Refresh'}
              </button>
            </div>
            {loadingTables ? (
              <div className="text-center py-12 text-gray-400">Loading table metadata...</div>
            ) : tables.length === 0 ? (
              <div className="text-center py-12 text-gray-400">No tables found. Make sure the database is set up.</div>
            ) : (
              <div className="space-y-2">
                {tables.map((table) => (
                  <div key={table.name} className="border border-gray-800 rounded-lg overflow-hidden">
                    <div
                      className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-800/30 transition"
                      onClick={() => setExpandedTable(expandedTable === table.name ? null : table.name)}
                    >
                      <div className="flex items-center space-x-4">
                        <span className="text-xs text-gray-500">{expandedTable === table.name ? '▼' : '▶'}</span>
                        <div>
                          <span className="font-mono font-semibold text-purple-300">{table.name}</span>
                          <span className="text-gray-500 text-sm ml-2">{table.schema}</span>
                        </div>
                      </div>
                      <div className="flex items-center space-x-6">
                        <div className="text-right">
                          <span className="text-sm text-gray-400">Rows: </span>
                          <span className="font-mono font-semibold">{getRowCount(table).toLocaleString()}</span>
                        </div>
                        <div className="text-right">
                          <span className="text-sm text-gray-400">Size: </span>
                          <span className="font-mono text-sm">{getSizeFormatted(table)}</span>
                        </div>
                        <button
                          onClick={(e) => { e.stopPropagation(); openTableBrowser(table.name) }}
                          className="bg-purple-600/20 hover:bg-purple-600/40 text-purple-300 px-3 py-1 rounded text-sm transition"
                        >
                          Browse
                        </button>
                      </div>
                    </div>
                    {expandedTable === table.name && getColumns(table).length > 0 && (
                      <div className="border-t border-gray-800 bg-gray-950/50 p-4">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-gray-500">
                              <th className="text-left py-1 px-2">Column</th>
                              <th className="text-left py-1 px-2">Type</th>
                              <th className="text-left py-1 px-2">Nullable</th>
                              <th className="text-left py-1 px-2">Default</th>
                              <th className="text-left py-1 px-2">PK</th>
                            </tr>
                          </thead>
                          <tbody>
                            {getColumns(table).map((col) => (
                              <tr key={col.name} className="border-t border-gray-800/50">
                                <td className="py-1.5 px-2 font-mono text-blue-300">{col.name}</td>
                                <td className="py-1.5 px-2 font-mono text-gray-400">{col.type}</td>
                                <td className="py-1.5 px-2">{col.nullable ? <span className="text-yellow-400">Yes</span> : <span className="text-gray-600">No</span>}</td>
                                <td className="py-1.5 px-2 font-mono text-gray-500 text-xs max-w-[200px] truncate">{col.defaultValue || '—'}</td>
                                <td className="py-1.5 px-2">{col.isPrimaryKey && <span className="text-green-400 font-bold">PK</span>}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                    {expandedTable === table.name && getColumns(table).length === 0 && (
                      <div className="border-t border-gray-800 bg-gray-950/50 p-4 text-gray-500 text-sm">
                        Column metadata not available. Run the SQL functions in Supabase to enable full schema info.
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ============ Data Browser Tab ============ */}
        {activeTab === 'browser' && (
          <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-lg p-6">
            <div className="flex items-center space-x-4 mb-4">
              <select
                value={selectedTable || ''}
                onChange={(e) => { if (e.target.value) openTableBrowser(e.target.value) }}
                aria-label="Select database table"
                className="bg-gray-800/50 border border-gray-700 rounded-lg px-4 py-2 text-white min-w-[240px]"
              >
                <option value="">Select a table...</option>
                {tables.map((t) => (
                  <option key={t.name} value={t.name}>{t.name} ({getRowCount(t).toLocaleString()} rows)</option>
                ))}
              </select>
              {selectedTable && (
                <>
                  <button
                    onClick={() => fetchTableData(selectedTable, browserPage)}
                    disabled={loadingData}
                    className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg transition text-sm disabled:opacity-50"
                  >
                    Refresh
                  </button>
                  <button
                    onClick={() => {
                      const cols = tableData?.rows[0] ? Object.keys(tableData.rows[0]) : []
                      const empty: Record<string, any> = {}
                      cols.forEach((c) => { empty[c] = '' })
                      setEditModal({ row: empty, isNew: true })
                    }}
                    className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg transition text-sm"
                  >
                    + Insert Row
                  </button>
                </>
              )}
            </div>

            <p className="text-xs text-gray-600 mb-4">Right-click any row for edit options</p>

            {!selectedTable ? (
              <div className="text-center py-16 text-gray-500">Select a table above to browse its data</div>
            ) : loadingData ? (
              <div className="text-center py-12 text-gray-400">Loading data...</div>
            ) : tableData ? (
              <>
                <div className="flex justify-between items-center mb-4">
                  <div className="text-sm text-gray-400">
                    Showing {tableData.rows.length} of {tableData.totalRows.toLocaleString()} rows
                    {orderBy && <span className="ml-2 text-purple-400">sorted by {orderBy} {orderDir}</span>}
                  </div>
                  <button
                    onClick={() => { setSqlQuery(`SELECT * FROM ${selectedTable} LIMIT 100;`); setActiveTab('query') }}
                    className="text-purple-400 hover:text-purple-300 text-sm transition"
                  >
                    Open in SQL →
                  </button>
                </div>

                <div className="overflow-x-auto border border-gray-800 rounded-lg">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-800/50">
                        {tableData.rows.length > 0 &&
                          Object.keys(tableData.rows[0]).map((col) => (
                            <th
                              key={col}
                              className="text-left py-2.5 px-3 text-gray-400 font-semibold cursor-pointer hover:text-white transition whitespace-nowrap"
                              onClick={() => handleSort(col)}
                            >
                              {col}
                              {orderBy === col && <span className="ml-1 text-purple-400">{orderDir === 'asc' ? '↑' : '↓'}</span>}
                            </th>
                          ))}
                      </tr>
                    </thead>
                    <tbody>
                      {tableData.rows.map((row, i) => (
                        <tr
                          key={i}
                          className="border-t border-gray-800/50 hover:bg-gray-800/20 transition cursor-context-menu"
                          onContextMenu={(e) => handleRowContextMenu(e, row, i)}
                        >
                          {Object.values(row).map((val, j) => (
                            <td key={j} className="py-2 px-3 font-mono text-xs max-w-[300px] truncate">
                              <CellValue value={val} />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {tableData.totalPages > 1 && (
                  <div className="mt-4 flex justify-between items-center">
                    <div className="text-gray-400 text-sm">Page {tableData.page} of {tableData.totalPages}</div>
                    <div className="flex space-x-2">
                      <button
                        onClick={() => setBrowserPage(Math.max(1, browserPage - 1))}
                        disabled={browserPage === 1}
                        className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg transition text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Previous
                      </button>
                      <button
                        onClick={() => setBrowserPage(Math.min(tableData.totalPages, browserPage + 1))}
                        disabled={browserPage >= tableData.totalPages}
                        className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg transition text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </>
            ) : null}
          </div>
        )}

        {/* ============ SQL Query Tab ============ */}
        {activeTab === 'query' && (
          <div className="space-y-4">
            <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-lg p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold">SQL Query Runner</h2>
                <span className="text-xs text-yellow-400 bg-yellow-900/20 border border-yellow-800 px-3 py-1 rounded-full">
                  Read-only — SELECT queries only
                </span>
              </div>
              <div className="mb-4">
                <div className="flex gap-2 mb-3">
                  {[
                    { label: 'All tables', sql: "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;" },
                    { label: 'Table sizes', sql: "SELECT relname AS table, reltuples::bigint AS est_rows, pg_size_pretty(pg_total_relation_size(c.oid)) AS size FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind = 'r' ORDER BY pg_total_relation_size(c.oid) DESC;" },
                    { label: 'Recent purchases', sql: 'SELECT * FROM purchases ORDER BY created_at DESC LIMIT 10;' },
                    { label: 'Active admins', sql: 'SELECT id, email, role, active, created_at FROM admins WHERE active = true;' },
                  ].map((preset) => (
                    <button
                      key={preset.label}
                      onClick={() => setSqlQuery(preset.sql)}
                      className="bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-1.5 rounded text-xs transition"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
                <textarea
                  value={sqlQuery}
                  onChange={(e) => setSqlQuery(e.target.value)}
                  onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); runQuery() } }}
                  className="w-full px-4 py-3 bg-gray-950 border border-gray-700 rounded-lg text-white font-mono text-sm resize-y focus:border-purple-500 focus:ring-1 focus:ring-purple-500 outline-none"
                  rows={6}
                  placeholder="SELECT * FROM audio_files LIMIT 10;"
                  spellCheck={false}
                />
                <div className="flex justify-between items-center mt-3">
                  <span className="text-xs text-gray-500">Press ⌘+Enter to run</span>
                  <button
                    onClick={runQuery}
                    disabled={runningQuery || !sqlQuery.trim()}
                    className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-2 rounded-lg transition font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {runningQuery ? 'Running...' : 'Run Query'}
                  </button>
                </div>
              </div>
            </div>
            {(queryResult || queryError) && (
              <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-lg p-6">
                {queryError ? (
                  <div className="text-red-400">
                    <div className="font-semibold mb-1">Query Error</div>
                    <div className="font-mono text-sm">{queryError}</div>
                  </div>
                ) : queryResult && (
                  <>
                    <div className="flex justify-between items-center mb-4">
                      <div className="text-sm text-gray-400">
                        {queryResult.length} row{queryResult.length !== 1 ? 's' : ''} returned
                        {queryTime !== null && <span className="ml-2 text-gray-500">({queryTime}ms)</span>}
                      </div>
                      {queryResult.length > 0 && (
                        <button onClick={() => exportQueryResults(queryResult)} className="text-green-400 hover:text-green-300 text-sm transition">Export CSV</button>
                      )}
                    </div>
                    {queryResult.length === 0 ? (
                      <div className="text-center py-8 text-gray-500">Query returned no rows.</div>
                    ) : (
                      <div className="overflow-x-auto border border-gray-800 rounded-lg">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-gray-800/50">
                              {Object.keys(queryResult[0]).map((col) => (
                                <th key={col} className="text-left py-2.5 px-3 text-gray-400 font-semibold whitespace-nowrap">{col}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {queryResult.map((row, i) => (
                              <tr key={i} className="border-t border-gray-800/50 hover:bg-gray-800/20 transition">
                                {Object.values(row).map((val, j) => (
                                  <td key={j} className="py-2 px-3 font-mono text-xs max-w-[300px] truncate"><CellValue value={val} /></td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ============ Right-Click Context Menu ============ */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="fixed z-50 bg-gray-900 border border-gray-700 rounded-lg shadow-2xl py-1.5 min-w-[200px] animate-fade-in"
          style={{ top: contextMenu.y, left: contextMenu.x }}
        >
          <ContextMenuItem
            label="Edit Row"
            icon="✏️"
            onClick={() => { setEditModal({ row: contextMenu.row, isNew: false }); setContextMenu(null) }}
          />
          <ContextMenuItem
            label="Duplicate Row"
            icon="📋"
            onClick={() => { handleDuplicateRow(contextMenu.row); setContextMenu(null) }}
          />
          <ContextMenuItem
            label="Copy Row as JSON"
            icon="📄"
            onClick={() => handleCopyRow(contextMenu.row)}
          />
          <ContextMenuItem
            label="Copy Cell Value"
            icon="📎"
            disabled={!contextMenu.row}
            onClick={() => {
              const vals = Object.values(contextMenu.row)
              handleCopyCell(vals[0])
            }}
          />
          <div className="border-t border-gray-700 my-1.5" />
          <ContextMenuItem
            label="Insert New Row"
            icon="➕"
            onClick={() => {
              const cols = Object.keys(contextMenu.row)
              const empty: Record<string, any> = {}
              cols.forEach((c) => { empty[c] = '' })
              setEditModal({ row: empty, isNew: true })
              setContextMenu(null)
            }}
          />
          <div className="border-t border-gray-700 my-1.5" />
          <ContextMenuItem
            label="Delete Row"
            icon="🗑️"
            danger
            onClick={() => { setConfirmDelete(contextMenu.row); setContextMenu(null) }}
          />
        </div>
      )}

      {/* ============ Edit / Insert Modal ============ */}
      {editModal && (
        <EditRowModal
          row={editModal.row}
          isNew={editModal.isNew}
          tableName={selectedTable || ''}
          saving={saving}
          onSave={(updates) => {
            if (editModal.isNew) handleInsertRow(updates)
            else handleUpdateRow(editModal.row, updates)
          }}
          onClose={() => setEditModal(null)}
        />
      )}

      {/* ============ Delete Confirmation ============ */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl">
            <h3 className="text-xl font-semibold text-red-400 mb-3">Confirm Delete</h3>
            <p className="text-gray-300 mb-2">
              Are you sure you want to delete this row from <span className="font-mono text-purple-300">{selectedTable}</span>?
            </p>
            <div className="bg-gray-950 rounded-lg p-3 mb-4 max-h-32 overflow-y-auto">
              <pre className="text-xs text-gray-400 font-mono">{JSON.stringify(confirmDelete, null, 2)}</pre>
            </div>
            <p className="text-red-400 text-sm mb-4">This action cannot be undone.</p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setConfirmDelete(null)}
                className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg transition"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteRow(confirmDelete)}
                disabled={saving}
                className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg transition disabled:opacity-50"
              >
                {saving ? 'Deleting...' : 'Delete Row'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ============ Sub-components ============ */

function ContextMenuItem({
  label, icon, onClick, danger, disabled,
}: {
  label: string; icon: string; onClick: () => void; danger?: boolean; disabled?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-full text-left px-4 py-2 text-sm flex items-center space-x-3 transition disabled:opacity-40 disabled:cursor-not-allowed ${
        danger
          ? 'text-red-400 hover:bg-red-900/30'
          : 'text-gray-200 hover:bg-gray-800'
      }`}
    >
      <span className="text-base w-5 text-center">{icon}</span>
      <span>{label}</span>
    </button>
  )
}

function EditRowModal({
  row, isNew, tableName, saving, onSave, onClose,
}: {
  row: Record<string, any>
  isNew: boolean
  tableName: string
  saving: boolean
  onSave: (updates: Record<string, any>) => void
  onClose: () => void
}) {
  const [fields, setFields] = useState<Record<string, string>>(() => {
    const f: Record<string, string> = {}
    Object.entries(row).forEach(([k, v]) => {
      f[k] = v === null ? '' : typeof v === 'object' ? JSON.stringify(v, null, 2) : String(v)
    })
    return f
  })

  const autoFields = ['id', 'created_at', 'updated_at']

  function handleSave() {
    const updates: Record<string, any> = {}
    Object.entries(fields).forEach(([key, val]) => {
      if (isNew && autoFields.includes(key) && val === '') return
      if (!isNew && val === (row[key] === null ? '' : typeof row[key] === 'object' ? JSON.stringify(row[key], null, 2) : String(row[key]))) return

      if (val === '') {
        updates[key] = null
      } else {
        try { updates[key] = JSON.parse(val) }
        catch { updates[key] = val }
      }
    })

    if (!isNew && Object.keys(updates).length === 0) {
      onClose()
      return
    }

    onSave(isNew ? (() => {
      const full: Record<string, any> = {}
      Object.entries(fields).forEach(([k, v]) => {
        if (autoFields.includes(k) && v === '') return
        if (v === '') { full[k] = null; return }
        try { full[k] = JSON.parse(v) }
        catch { full[k] = v }
      })
      return full
    })() : updates)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-gray-900 border border-gray-700 rounded-xl max-w-2xl w-full mx-4 shadow-2xl max-h-[85vh] flex flex-col">
        <div className="p-6 border-b border-gray-800 flex-shrink-0">
          <h3 className="text-xl font-semibold">
            {isNew ? 'Insert New Row' : 'Edit Row'}
            <span className="ml-2 text-sm font-normal text-gray-400">in <span className="font-mono text-purple-300">{tableName}</span></span>
          </h3>
        </div>
        <div className="p-6 overflow-y-auto flex-1 space-y-4">
          {Object.entries(fields).map(([key, val]) => {
            const isAuto = autoFields.includes(key)
            const isLongValue = val.length > 80 || val.includes('\n')
            return (
              <div key={key}>
                <label className="flex items-center text-sm font-medium text-gray-300 mb-1.5">
                  <span className="font-mono">{key}</span>
                  {isAuto && <span className="ml-2 text-xs text-gray-600">(auto-generated)</span>}
                </label>
                {isLongValue ? (
                  <textarea
                    value={val}
                    onChange={(e) => setFields({ ...fields, [key]: e.target.value })}
                    disabled={!isNew && isAuto}
                    aria-label={`Edit ${key}`}
                    className="w-full px-3 py-2 bg-gray-950 border border-gray-700 rounded-lg text-white font-mono text-sm resize-y focus:border-purple-500 focus:ring-1 focus:ring-purple-500 outline-none disabled:opacity-40 disabled:cursor-not-allowed"
                    rows={4}
                  />
                ) : (
                  <input
                    type="text"
                    value={val}
                    onChange={(e) => setFields({ ...fields, [key]: e.target.value })}
                    disabled={!isNew && isAuto}
                    className="w-full px-3 py-2 bg-gray-950 border border-gray-700 rounded-lg text-white font-mono text-sm focus:border-purple-500 focus:ring-1 focus:ring-purple-500 outline-none disabled:opacity-40 disabled:cursor-not-allowed"
                    placeholder={isNew && isAuto ? 'Leave blank for auto-generated' : ''}
                  />
                )}
              </div>
            )
          })}
        </div>
        <div className="p-6 border-t border-gray-800 flex justify-end space-x-3 flex-shrink-0">
          <button
            onClick={onClose}
            className="bg-gray-700 hover:bg-gray-600 text-white px-5 py-2 rounded-lg transition"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="bg-purple-600 hover:bg-purple-700 text-white px-5 py-2 rounded-lg transition font-medium disabled:opacity-50"
          >
            {saving ? 'Saving...' : isNew ? 'Insert Row' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}

function CellValue({ value }: { value: any }) {
  if (value === null || value === undefined) return <span className="text-gray-600 italic">null</span>
  if (typeof value === 'boolean') return <span className={value ? 'text-green-400' : 'text-red-400'}>{value.toString()}</span>
  if (typeof value === 'object') {
    const str = JSON.stringify(value)
    return <span className="text-yellow-300" title={str}>{str.length > 60 ? str.substring(0, 60) + '...' : str}</span>
  }
  const str = String(value)
  if (str.match(/^\d{4}-\d{2}-\d{2}T/)) return <span className="text-blue-300">{new Date(str).toLocaleString()}</span>
  if (str.length > 80) return <span title={str}>{str.substring(0, 80)}...</span>
  return <span>{str}</span>
}

function exportQueryResults(rows: any[]) {
  if (!rows.length) return
  const headers = Object.keys(rows[0])
  const csvRows = rows.map((row) =>
    headers.map((h) => {
      const val = row[h]
      const str = val === null ? '' : typeof val === 'object' ? JSON.stringify(val) : String(val)
      return `"${str.replace(/"/g, '""')}"`
    }).join(',')
  )
  const csv = [headers.join(','), ...csvRows].join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `query-results-${new Date().toISOString().split('T')[0]}.csv`
  a.click()
  URL.revokeObjectURL(url)
}
