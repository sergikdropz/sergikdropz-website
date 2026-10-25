'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { APP_SHELL_TITLE_SLOT_ID } from '@/components/shell/AppShell'
import {
  departmentMailCounts,
  dueScheduledMail,
  filterDepartmentMail,
  groupMailThreads,
  mailThreadKey,
  replySubject,
  type DepartmentMailMessage,
  type MailFolder,
} from '@/lib/email/department-mailbox'
import { snippetsForAccount, type MailSnippet } from '@/lib/email/mail-snippets'
import { isBroadcastActivityId, mergeBroadcastActivity } from '@/lib/email/broadcast-activity'
import {
  appendMailProse,
  composeMailBody,
  extraComposeMenus,
  formatMailCopy,
  insertMailBlock,
  parseMailMessage,
  promoAssetLabel,
  promoKindsForAccount,
  promoMenuItems,
  readableMailSource,
  type MailBlock,
  type PromoMenuItem,
  type PromoRelease,
} from '@/lib/email/promo-assets'
import { applyMailRecipient, isDeskSection, isMailSetting, MAIL_SETTINGS, predictMailRecipients, type DeskSection, type MailContact, type MailSetting } from '@/lib/email/department-desk'
import { buildTextPdf, extractPdfText, isPdfFile } from '@/lib/email/pdf-attachment'
import DepartmentMailHub from '@/components/admin/DepartmentMailHub'
import DepartmentMailSettings from '@/components/admin/DepartmentMailSettings'

type Department = {
  id: string
  name: string
  localPart: string
  purpose: string
  address: string
  builtin: boolean
}

type AccountDraft = { name: string; localPart: string; purpose: string }

type Pane = 'mail' | 'compose' | 'settings' | DeskSection

const DESK_NAV: { id: DeskSection; label: string }[] = [
  { id: 'broadcasts', label: 'Broadcasts' },
  { id: 'automations', label: 'Automations' },
  { id: 'templates', label: 'Templates' },
  { id: 'audience', label: 'Audience' },
  { id: 'metrics', label: 'Metrics' },
]

const LOCAL_KEY = 'department-mail-desk-v1'
const NAV_WIDTH_KEY = 'department-mail-nav-width'
const LIST_WIDTH_KEY = 'department-mail-list-width'
const NAV_OPEN_KEY = 'department-mail-nav-open'
const LIST_OPEN_KEY = 'department-mail-list-open'

function clampColumn(next: number, min: number, max: number) {
  return Math.round(Math.min(max, Math.max(min, next)))
}

function readStoredNumber(key: string, fallback: number, min: number, max: number) {
  const raw = window.localStorage.getItem(key)
  const stored = raw == null ? Number.NaN : Number(raw)
  return Number.isFinite(stored) ? clampColumn(stored, min, max) : fallback
}

function MailSideColumn({
  open,
  width,
  label,
  onToggle,
  onResizeStart,
  onNudge,
  children,
  rail,
  collapsedWidth = '2.25rem',
  className = '',
  bodyClassName = '',
}: {
  open: boolean
  width: number
  label: string
  onToggle: () => void
  onResizeStart: (event: ReactPointerEvent<HTMLButtonElement>) => void
  onNudge: (delta: number) => void
  children: ReactNode
  rail?: ReactNode
  collapsedWidth?: string
  className?: string
  bodyClassName?: string
}) {
  return (
    <div
      className={`relative min-h-10 w-full md:h-full md:shrink-0 md:[width:var(--mail-col)] ${className}`}
      style={{ '--mail-col': open ? `${width}px` : collapsedWidth } as CSSProperties}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-label={open ? `Collapse ${label}` : `Expand ${label}`}
        className="absolute left-1.5 top-1.5 z-20 flex h-7 w-7 items-center justify-center rounded-md border border-zinc-700 bg-zinc-950 text-zinc-300 hover:bg-zinc-800"
      >
        <span aria-hidden="true" className={open ? '' : 'inline-block rotate-180'}>‹</span>
      </button>
      {open ? (
        <>
          <div className={`h-full min-h-0 overflow-hidden ${bodyClassName}`}>{children}</div>
          <button
            type="button"
            role="separator"
            aria-orientation="vertical"
            aria-label={`Resize ${label}`}
            aria-valuenow={width}
            onPointerDown={onResizeStart}
            onKeyDown={(event) => {
              if (event.key === 'ArrowLeft') {
                event.preventDefault()
                onNudge(-16)
              } else if (event.key === 'ArrowRight') {
                event.preventDefault()
                onNudge(16)
              }
            }}
            className="group absolute inset-y-0 right-0 z-20 hidden w-2 cursor-col-resize md:block"
          >
            <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-zinc-700 group-hover:bg-violet-300 group-focus:bg-violet-300" />
          </button>
        </>
      ) : rail ? (
        <div className="hidden h-full min-h-0 flex-col items-center gap-1 overflow-y-auto px-1 pb-2 pt-10 md:flex">{rail}</div>
      ) : null}
    </div>
  )
}

function MailNavIcon({ name }: { name: string }) {
  const paths: Record<string, string> = {
    compose: 'M12 20h9 M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4 11.5-11.5z',
    inbox: 'M22 12h-6l-2 3h-4l-2-3H2 M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z',
    sent: 'M22 2 11 13 M22 2l-7 20-4-9-9-4 20-7z',
    drafts: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M8 13h8 M8 17h5',
    scheduled: 'M12 8v4l3 2 M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z',
    broadcasts: 'M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1z M15.5 8.5a5 5 0 0 1 0 7 M18.5 5.5a9 9 0 0 1 0 13',
    automations: 'M13 2 3 14h9l-1 8 10-12h-9l1-8z',
    templates: 'M8 4h10a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H8 M4 8h10a2 2 0 0 1 2 2v10 M8 4v16',
    audience: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M22 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75',
    metrics: 'M4 19V5 M4 19h16 M8 16v-5 M12 16V8 M16 16v-3',
    trash: 'M3 6h18 M8 6V4h8v2 M6 6l1 14h10l1-14',
    settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9c.3.7.9 1.2 1.6 1.3H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
    webhooks: 'M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1.2 1.2 M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1.2-1.2',
    usage: 'M12 22a10 10 0 1 0 0-20 M12 12l4-6',
    team: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M23 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75',
    sending: 'M4 4h16v16H4z M22 6l-10 7L2 6',
    integrations: 'M9 7V3 M15 7V3 M7 11h10 M7 21h10a2 2 0 0 0 2-2v-8H5v8a2 2 0 0 0 2 2z',
    unsubscribe: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M6 6l12 12',
  }
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={paths[name] || paths.inbox} />
    </svg>
  )
}
const emptyAccount: AccountDraft = { name: '', localPart: '', purpose: '' }

const FOLDERS: { id: MailFolder; label: string }[] = [
  { id: 'inbox', label: 'Inbox' },
  { id: 'sent', label: 'Sent' },
  { id: 'drafts', label: 'Drafts' },
  { id: 'scheduled', label: 'Scheduled' },
  { id: 'trash', label: 'Trash' },
]

function readLocalMail(): DepartmentMailMessage[] {
  try {
    const raw = localStorage.getItem(LOCAL_KEY)
    const parsed = raw ? (JSON.parse(raw) as unknown) : []
    if (!Array.isArray(parsed)) return []
    return (parsed as DepartmentMailMessage[]).map((item) => ({
      ...item,
      attachments: Array.isArray(item.attachments) ? item.attachments : [],
    }))
  } catch {
    return []
  }
}

function writeLocalMail(messages: DepartmentMailMessage[]) {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(messages))
}

function formatMailWhen(iso: string | null): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const now = new Date()
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  }
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

function snippet(body: string): string {
  return body.replace(/\s+/g, ' ').trim().slice(0, 96)
}

async function readComposeFiles(files: File[]) {
  const uploads = []
  for (const file of files) {
    const bytes = new Uint8Array(await file.arrayBuffer())
    let binary = ''
    for (const byte of bytes) binary += String.fromCharCode(byte)
    uploads.push({
      filename: file.name,
      contentType: file.type || 'application/octet-stream',
      size: file.size,
      contentBase64: btoa(binary),
    })
  }
  return uploads
}

function CopyPieces({ text }: { text: string }) {
  const pieces = formatMailCopy(text)
  if (!pieces.length) return null
  return (
    <div className="max-w-[36rem] space-y-3">
      {pieces.map((piece, index) => {
        if (piece.type === 'tracks') {
          return (
            <div key={`${piece.label}-${index}`}>
              <p className="text-sm font-medium text-zinc-100">{piece.label}</p>
              <ul className="mt-1 space-y-1">
                {piece.tracks.map((track) => (
                  <li key={track} className="text-sm leading-6 text-zinc-300">
                    {track}
                  </li>
                ))}
              </ul>
            </div>
          )
        }
        if (piece.type === 'tags') {
          return (
            <p key={`${piece.text}-${index}`} className="text-sm leading-6 text-zinc-500">
              {piece.text}
            </p>
          )
        }
        return (
          <p key={`${index}-${piece.text.slice(0, 24)}`} className={`text-sm leading-6 ${index === 0 ? 'text-zinc-100' : 'text-zinc-300'}`}>
            {piece.text}
          </p>
        )
      })}
    </div>
  )
}

function RenderedMail({ body }: { body: string }) {
  const { prose, blocks } = parseMailMessage(body)
  return (
    <div className="mt-4 max-w-[36rem] space-y-5">
      {prose ? <CopyPieces text={prose} /> : null}
      {blocks.map((block, index) => (
        <MailBlockView key={`${block.kind}-${index}`} block={block} />
      ))}
    </div>
  )
}

function MailBlockView({ block, onChange }: { block: MailBlock; onChange?: (next: MailBlock) => void }) {
  if (block.kind === 'cover') {
    return (
      <figure>
        <img src={block.url} alt={`${block.title} cover`} className="h-auto w-full max-w-[36rem] rounded-md" />
        {onChange ? (
          <input
            value={block.title}
            onChange={(event) => onChange({ ...block, title: event.target.value })}
            aria-label="Cover title"
            className="mt-2 w-full max-w-[36rem] rounded-md border border-zinc-800 bg-transparent px-2 py-1 text-sm text-zinc-100"
          />
        ) : (
          <figcaption className="mt-2 text-sm text-zinc-300">{block.title}</figcaption>
        )}
      </figure>
    )
  }
  if (block.kind === 'link') {
    if (!onChange) {
      return (
        <a href={block.url} target="_blank" rel="noreferrer" className="block rounded-md bg-zinc-100 px-3 py-2 text-center text-sm font-medium text-zinc-950">
          {block.label}
        </a>
      )
    }
    return (
      <div className="max-w-[36rem] space-y-2">
        <input
          value={block.label}
          onChange={(event) => onChange({ ...block, label: event.target.value })}
          aria-label="Link label"
          className="w-full rounded-md border border-zinc-800 bg-zinc-100 px-3 py-2 text-sm font-medium text-zinc-950"
        />
        <input
          value={block.url}
          onChange={(event) => onChange({ ...block, url: event.target.value })}
          aria-label="Link address"
          className="w-full rounded-md border border-zinc-800 bg-transparent px-3 py-2 text-sm text-zinc-300"
        />
      </div>
    )
  }
  if (block.kind === 'note') {
    return (
      <section>
        <p className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">{block.title}</p>
        <div className="mt-2">
          {onChange ? (
            <textarea
              value={block.text}
              onChange={(event) => onChange({ ...block, text: event.target.value })}
              aria-label={block.title}
              rows={Math.min(14, Math.max(3, block.text.split('\n').length + 1))}
              className="w-full max-w-[36rem] rounded-md border border-zinc-800 bg-transparent px-3 py-2 text-sm leading-6 text-zinc-100"
            />
          ) : (
            <CopyPieces text={block.text} />
          )}
        </div>
      </section>
    )
  }
  const label = block.kind === 'press' ? 'Press' : 'Promo'
  return (
    <section>
      <p className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">{label}</p>
      {onChange ? (
        <input
          value={block.title}
          onChange={(event) => onChange({ ...block, title: event.target.value })}
          aria-label={`${label} title`}
          className="mt-1 w-full max-w-[36rem] rounded-md border border-zinc-800 bg-transparent px-2 py-1 text-base font-medium text-zinc-100"
        />
      ) : (
        <h3 className="mt-1 text-base font-medium text-zinc-100">{block.title}</h3>
      )}
      <div className="mt-3">
        {onChange ? (
          <textarea
            value={block.text}
            onChange={(event) => onChange({ ...block, text: event.target.value })}
            aria-label={`${label} for ${block.title}`}
            rows={Math.min(18, Math.max(4, block.text.split('\n').length + 1))}
            className="w-full max-w-[36rem] rounded-md border border-zinc-800 bg-transparent px-3 py-2 text-sm leading-6 text-zinc-100"
          />
        ) : (
          <CopyPieces text={block.text} />
        )}
      </div>
    </section>
  )
}

function PromoAssetMenu({
  menuId,
  label,
  items,
  open,
  activeIndex,
  onOpen,
  onActive,
  onPick,
}: {
  menuId: string
  label: string
  items: PromoMenuItem[]
  open: boolean
  activeIndex: number
  onOpen: (menuId: string | null) => void
  onActive: (index: number) => void
  onPick: (item: PromoMenuItem) => void
}) {
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState<{ left: number; bottom: number; width: number; maxHeight: number } | null>(null)
  const listId = `promo-asset-${menuId}`

  useEffect(() => {
    if (!open) return
    function place() {
      const node = buttonRef.current
      if (!node) return
      const rect = node.getBoundingClientRect()
      const width = 300
      const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8))
      const spaceAbove = Math.max(160, rect.top - 12)
      setBox({
        left,
        bottom: window.innerHeight - rect.top + 6,
        width,
        maxHeight: Math.min(360, spaceAbove),
      })
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open, items.length])

  useEffect(() => {
    if (!open) return
    function onDoc(event: MouseEvent) {
      const target = event.target as Node
      if (buttonRef.current?.contains(target) || menuRef.current?.contains(target)) return
      onOpen(null)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open, onOpen])

  useEffect(() => {
    if (!open) return
    menuRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [open, activeIndex])

  let lastGroup = ''

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-label={`Attach ${label.toLowerCase()}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => {
          if (open) {
            onOpen(null)
            return
          }
          if (!items.length) {
            onOpen(menuId)
            return
          }
          onOpen(menuId)
        }}
        onKeyDown={(event) => {
          if (!open && (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ')) {
            event.preventDefault()
            onOpen(menuId)
            return
          }
          if (!open) return
          if (event.key === 'ArrowDown') {
            event.preventDefault()
            onActive((activeIndex + 1) % items.length)
          } else if (event.key === 'ArrowUp') {
            event.preventDefault()
            onActive((activeIndex - 1 + items.length) % items.length)
          } else if (event.key === 'Enter') {
            const pick = items[activeIndex]
            if (!pick) return
            event.preventDefault()
            onPick(pick)
          } else if (event.key === 'Escape') {
            event.preventDefault()
            onOpen(null)
          }
        }}
        className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs ${
          open ? 'border-zinc-500 text-white' : 'border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-white'
        }`}
      >
        {label}
        <span aria-hidden className={`inline-block text-[10px] text-zinc-500 transition-transform ${open ? 'rotate-180' : ''}`}>
          ▾
        </span>
      </button>
      {open && items.length > 0 && box
        ? createPortal(
            <div
              ref={menuRef}
              id={listId}
              role="menu"
              aria-label={`${label} options`}
              style={{ left: box.left, bottom: box.bottom, width: box.width, maxHeight: box.maxHeight }}
              className="fixed z-[80] overflow-y-auto rounded-md border border-zinc-700 bg-zinc-950 py-1 shadow-xl"
            >
              {items.map((item, index) => {
                const header = item.group !== lastGroup
                lastGroup = item.group
                const active = index === activeIndex
                return (
                  <div key={item.id}>
                    {header ? (
                      <p className="px-3 pb-0.5 pt-2 text-[10px] font-medium uppercase tracking-wide text-zinc-500">{item.group}</p>
                    ) : null}
                    <button
                      type="button"
                      role="menuitem"
                      data-active={active ? 'true' : undefined}
                      onMouseEnter={() => onActive(index)}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => onPick(item)}
                      className={`block w-full px-3 py-1.5 text-left ${active ? 'bg-zinc-800 text-white' : 'text-zinc-200 hover:bg-zinc-900'}`}
                    >
                      <span className="block truncate text-sm">{item.label}</span>
                      <span className="block truncate text-xs text-zinc-500">{item.detail}</span>
                    </button>
                  </div>
                )
              })}
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}

function defaultScheduleValue(): string {
  const date = new Date(Date.now() + 60 * 60 * 1000)
  date.setMinutes(0, 0, 0)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export default function DepartmentMailDesk() {
  const [departments, setDepartments] = useState<Department[]>([])
  const [domain, setDomain] = useState('sergikdropz.com')
  const [messages, setMessages] = useState<DepartmentMailMessage[]>([])
  const [storage, setStorage] = useState<'server' | 'local'>('server')
  const [folder, setFolder] = useState<MailFolder>('inbox')
  const [pane, setPane] = useState<Pane>('mail')
  const [deskPane, setDeskPane] = useState<DeskSection>('broadcasts')
  const [setting, setSetting] = useState<MailSetting>('usage')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [accountId, setAccountId] = useState('all')
  const [query, setQuery] = useState('')
  const [sentQuery, setSentQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [composeId, setComposeId] = useState<string | null>(null)
  const [fromId, setFromId] = useState('studio')
  const [to, setTo] = useState('')
  const [contacts, setContacts] = useState<MailContact[]>([])
  const [suggestionIndex, setSuggestionIndex] = useState(0)
  const [searchSuggestionIndex, setSearchSuggestionIndex] = useState(0)
  const [searchBox, setSearchBox] = useState<'list' | 'sent'>('list')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [scheduleOn, setScheduleOn] = useState(false)
  const [scheduleAt, setScheduleAt] = useState(defaultScheduleValue)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<AccountDraft>(emptyAccount)
  const [addDraft, setAddDraft] = useState<AccountDraft>(emptyAccount)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<'send' | 'save' | 'move' | null>(null)
  const [files, setFiles] = useState<File[]>([])
  const [previewFile, setPreviewFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewText, setPreviewText] = useState('')
  const composeFromQuery = useRef(false)
  const [promoReleases, setPromoReleases] = useState<PromoRelease[]>([])
  const [promoKind, setPromoKind] = useState<string | null>(null)
  const [promoIndex, setPromoIndex] = useState(0)
  const [inboxShare, setInboxShare] = useState(50)
  const [navWidth, setNavWidth] = useState(192)
  const [listWidth, setListWidth] = useState(320)
  const [navOpen, setNavOpen] = useState(true)
  const [listOpen, setListOpen] = useState(true)
  const [titleSlot, setTitleSlot] = useState<HTMLElement | null>(null)
  const splitRef = useRef<HTMLDivElement | null>(null)

  const loadAccounts = useCallback(async () => {
    const res = await fetch('/api/admin/email/departments')
    const data = (await res.json()) as { departments?: Department[]; domain?: string; error?: string }
    if (!res.ok) throw new Error(data.error || 'Could not load accounts')
    const next = data.departments ?? []
    setDepartments(next)
    setDomain(data.domain || 'sergikdropz.com')
    setFromId((current) => (next.some((item) => item.id === current) ? current : next[0]?.id || 'studio'))
  }, [])

  const applyMessages = useCallback((next: DepartmentMailMessage[], mode: 'server' | 'local') => {
    setStorage(mode)
    setMessages(next)
    if (mode === 'local') writeLocalMail(next)
  }, [])

  const loadMail = useCallback(async () => {
    const res = await fetch('/api/admin/email/mailbox')
    const data = (await res.json()) as {
      available?: boolean
      messages?: DepartmentMailMessage[]
      activity?: DepartmentMailMessage[]
      error?: string
    }
    if (res.status === 401) throw new Error('Unauthorized')
    if (!res.ok) throw new Error(data.error || 'Could not load mail')
    if (data.available === false) {
      const local = readLocalMail()
      const due = dueScheduledMail(local).slice(0, 5)
      let next = local
      for (const message of due) {
        const sent = await fetch('/api/admin/email/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            department: message.accountId,
            to: message.to,
            subject: message.subject,
            text: message.body,
          }),
        })
        const payload = (await sent.json()) as { error?: string; messageId?: string | null }
        next = next.map((item) =>
          item.id === message.id
            ? sent.ok
              ? {
                  ...item,
                  folder: 'sent' as const,
                  status: 'sent',
                  resendId: payload.messageId ?? null,
                  scheduledAt: null,
                  updatedAt: new Date().toISOString(),
                }
              : { ...item, status: 'failed', errorMessage: payload.error || 'Send failed' }
            : item,
        )
      }
      applyMessages(mergeBroadcastActivity(next, data.activity ?? []), 'local')
      return
    }
    applyMessages(data.messages ?? [], 'server')
  }, [applyMessages])

  useEffect(() => {
    if (isDeskSection(pane)) setDeskPane(pane)
  }, [pane])

  useEffect(() => {
    const { prose, blocks } = parseMailMessage(body)
    let changed = false
    const next = blocks.map((block) => {
      if ((block.kind !== 'press' && block.kind !== 'caption') || block.text.includes('\n')) return block
      const readable = readableMailSource(block.text)
      if (!readable || readable === block.text) return block
      changed = true
      return { ...block, text: readable }
    })
    if (changed) setBody(composeMailBody(prose, next))
  }, [body])

  useEffect(() => {
    let cancelled = false
    void fetch('/api/admin/email/desk')
      .then(async (res) => {
        if (!res.ok) return
        const data = (await res.json()) as { contacts?: MailContact[]; promoReleases?: PromoRelease[] }
        if (cancelled) return
        if (Array.isArray(data.contacts)) setContacts(data.contacts)
        if (Array.isArray(data.promoReleases)) setPromoReleases(data.promoReleases)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const mailbox = params.get('mailbox')
    const q = params.get('q')
    const folder = params.get('folder')
    if (mailbox) setAccountId(mailbox)
    if (folder === 'inbox' || folder === 'sent' || folder === 'drafts' || folder === 'scheduled' || folder === 'trash') {
      setFolder(folder)
    }
    if (q) {
      setQuery(q)
      setSentQuery(q)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    void Promise.all([loadAccounts(), loadMail()]).catch((loadError: unknown) => {
      if (!cancelled) setError(loadError instanceof Error ? loadError.message : 'Could not load mail')
    })
    return () => {
      cancelled = true
    }
  }, [loadAccounts, loadMail])

  const counts = useMemo(() => departmentMailCounts(messages, accountId), [messages, accountId])
  const inboxUnread = useMemo(
    () =>
      messages.filter(
        (message) =>
          message.folder === 'inbox' &&
          message.unread &&
          (accountId === 'all' || message.accountId === accountId),
      ).length,
    [messages, accountId],
  )
  const visible = useMemo(
    () => filterDepartmentMail(messages, { folder, accountId, query }),
    [messages, folder, accountId, query],
  )
  const threads = useMemo(() => {
    const grouped = groupMailThreads(visible)
    if (folder !== 'scheduled') return grouped
    return [...grouped].sort((a, b) => (a.latest.scheduledAt || a.latest.updatedAt).localeCompare(b.latest.scheduledAt || b.latest.updatedAt))
  }, [visible, folder])
  const selected = messages.find((message) => message.id === selectedId) ?? null
  const selectedThread = useMemo(() => {
    if (!selected) return []
    const key = mailThreadKey(selected)
    return messages
      .filter(
        (message) =>
          mailThreadKey(message) === key && (folder === 'trash' ? message.folder === 'trash' : message.folder !== 'trash'),
      )
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  }, [selected, messages, folder])
  const fromAccount = departments.find((item) => item.id === fromId)
  const snippets = snippetsForAccount(fromId)
  const promoToday = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Phoenix' }).format(new Date())
  const mailDraft = parseMailMessage(body)

  function openCompose(seed?: Partial<DepartmentMailMessage>) {
    setPane('compose')
    setComposeId(seed?.id && seed.folder === 'drafts' ? seed.id : seed?.folder === 'scheduled' ? seed.id ?? null : null)
    setFromId(seed?.accountId && departments.some((item) => item.id === seed.accountId) ? seed.accountId : fromId)
    setTo(seed?.to || '')
    setSuggestionIndex(-1)
    setSubject(seed?.subject || '')
    setBody(seed?.body || '')
    setScheduleOn(seed?.folder === 'scheduled')
    setScheduleAt(seed?.scheduledAt ? seed.scheduledAt.slice(0, 16) : defaultScheduleValue())
    setFiles([])
    setPreviewFile(null)
    setSelectedId(null)
    setNotice(null)
    setError(null)
  }

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('compose')
    if (!id || composeFromQuery.current) return
    const message = messages.find((item) => item.id === id)
    if (!message) return
    composeFromQuery.current = true
    openCompose(message)
    const stored = message.attachments.filter((file) => file.href)
    if (!stored.length) return
    void (async () => {
      const next: File[] = []
      for (const file of stored) {
        const res = await fetch(file.href || '', { credentials: 'same-origin' })
        if (!res.ok) continue
        const blob = await res.blob()
        next.push(new File([blob], file.filename, { type: file.contentType || blob.type || 'application/pdf' }))
      }
      if (next.length) setFiles(next)
    })()
  }, [messages])

  useEffect(() => {
    if (!previewFile) {
      setPreviewUrl(null)
      setPreviewText('')
      return
    }
    const url = URL.createObjectURL(previewFile)
    setPreviewUrl(url)
    let cancelled = false
    void previewFile.arrayBuffer().then((buffer) => {
      if (!cancelled) setPreviewText(extractPdfText(new Uint8Array(buffer)))
    })
    return () => {
      cancelled = true
      URL.revokeObjectURL(url)
    }
  }, [previewFile])

  function applySnippet(snippet: MailSnippet) {
    setSubject((current) => (current.trim() ? current : snippet.subject))
    setBody((current) => (current.trim() ? `${current.trim()}\n\n${snippet.body}` : snippet.body))
    setNotice(null)
    setError(null)
  }

  function addFiles(list: FileList | File[] | null) {
    const picked = [...(list || [])]
    setFiles((current) => {
      const next = [...current]
      for (const file of picked) {
        if (file.size > 2 * 1024 * 1024) {
          setError(`${file.name} is over 2 MB.`)
          continue
        }
        if (next.length >= 3) {
          setError('Attach up to 3 files.')
          break
        }
        next.push(file)
      }
      return next
    })
  }

  function replaceComposeFile(currentFile: File, picked: File | null) {
    if (!picked) return
    if (picked.size > 2 * 1024 * 1024) {
      setError(`${picked.name} is over 2 MB.`)
      return
    }
    setError(null)
    setFiles((current) => current.map((item) => (item === currentFile ? picked : item)))
    setPreviewFile((current) => (current === currentFile ? picked : current))
  }

  function updateComposePdf() {
    if (!previewFile || !isPdfFile(previewFile)) return
    const next = new File([buildTextPdf(previewText) as BlobPart], previewFile.name, { type: 'application/pdf' })
    replaceComposeFile(previewFile, next)
    setNotice('Updated the attached PDF. It stays in this draft until you send.')
    setError(null)
  }

  function attachPromoItem(item: PromoMenuItem) {
    setPromoKind(null)
    setNotice(null)
    setError(null)
    if (item.subject) {
      setSubject(item.subject.slice(0, 200))
      return
    }
    if (item.prose) {
      setBody((current) => appendMailProse(current, item.prose || ''))
      return
    }
    if (item.block) setBody((current) => insertMailBlock(current, item.block!))
  }

  function removeMailBlock(index: number) {
    const { prose, blocks } = parseMailMessage(body)
    setBody(composeMailBody(prose, blocks.filter((_, blockIndex) => blockIndex !== index)))
  }

  function updateMailBlock(index: number, nextBlock: MailBlock) {
    const { prose, blocks } = parseMailMessage(body)
    setBody(composeMailBody(prose, blocks.map((block, blockIndex) => (blockIndex === index ? nextBlock : block))))
  }

  function openFolder(next: MailFolder) {
    setFolder(next)
    setPane('mail')
    setSelectedId(null)
    setNotice(null)
    setError(null)
  }

  async function mailbox(action: string, payload: Record<string, unknown>) {
    const res = await fetch('/api/admin/email/mailbox', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...payload }),
    })
    const data = (await res.json()) as { error?: string; consentUrl?: string; message?: DepartmentMailMessage; storage?: string }
    if (res.status === 503 || data.storage === 'local') {
      setStorage('local')
      return { local: true as const, data }
    }
    if (!res.ok) {
      const consent = typeof data.consentUrl === 'string' ? ` ${data.consentUrl}` : ''
      throw new Error(`${data.error || 'Could not update mail'}${consent}`)
    }
    return { local: false as const, data }
  }

  async function onSend(event: FormEvent) {
    event.preventDefault()
    setBusy('send')
    setNotice(null)
    setError(null)
    try {
      if (scheduleOn && files.length) {
        throw new Error('Attachments send now. Remove them to schedule this message.')
      }
      if (scheduleOn) {
        const when = new Date(scheduleAt)
        if (Number.isNaN(when.getTime())) throw new Error('Pick a send time.')
        if (storage === 'local') {
          const now = new Date().toISOString()
          const message: DepartmentMailMessage = {
            id: composeId || crypto.randomUUID(),
            accountId: fromId,
            folder: 'scheduled',
            direction: 'out',
            fromAddress: fromAccount?.address || '',
            fromName: fromAccount?.name || '',
            to: to.trim(),
            subject: subject.trim(),
            body,
            status: 'scheduled',
            unread: false,
            resendId: null,
            inboundId: null,
            scheduledAt: when.toISOString(),
            errorMessage: null,
            attachments: [],
            createdAt: now,
            updatedAt: now,
          }
          const next = [message, ...messages.filter((item) => item.id !== message.id)]
          applyMessages(next, 'local')
        } else {
          await mailbox('save', {
            id: composeId,
            accountId: fromId,
            to,
            subject,
            body,
            scheduledAt: when.toISOString(),
          })
          await loadMail()
        }
        setNotice('Scheduled.')
        openFolder('scheduled')
        return
      }

      const uploads = await readComposeFiles(files)
      if (storage === 'local') {
        const res = await fetch('/api/admin/email/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ department: fromId, to, subject, text: body, attachments: uploads }),
        })
        const data = (await res.json()) as { error?: string; messageId?: string | null }
        if (!res.ok) throw new Error(data.error || 'Send failed')
        const now = new Date().toISOString()
        const message: DepartmentMailMessage = {
          id: composeId || crypto.randomUUID(),
          accountId: fromId,
          folder: 'sent',
          direction: 'out',
          fromAddress: fromAccount?.address || '',
          fromName: fromAccount?.name || '',
          to: to.trim(),
          subject: subject.trim(),
          body: body.trim(),
          status: 'sent',
          unread: false,
          resendId: data.messageId ?? null,
          inboundId: null,
          scheduledAt: null,
          errorMessage: null,
          attachments: uploads.map(({ filename, contentType, size }) => ({ filename, contentType, size })),
          createdAt: now,
          updatedAt: now,
        }
        applyMessages([message, ...messages.filter((item) => item.id !== message.id)], 'local')
        setSelectedId(message.id)
      } else {
        const result = await mailbox('send', { id: composeId, accountId: fromId, to, subject, body, attachments: uploads })
        await loadMail()
        setSelectedId(result.data.message?.id ?? null)
      }
      setTo('')
      setSubject('')
      setBody('')
      setFiles([])
      setComposeId(null)
      setPane('mail')
      setFolder('sent')
      setNotice('Sent.')
    } catch (sendError: unknown) {
      setError(sendError instanceof Error ? sendError.message : 'Send failed')
    } finally {
      setBusy(null)
    }
  }

  async function saveDraft() {
    setBusy('save')
    setNotice(null)
    setError(null)
    try {
      if (storage === 'local') {
        const now = new Date().toISOString()
        const message: DepartmentMailMessage = {
          id: composeId || crypto.randomUUID(),
          accountId: fromId,
          folder: 'drafts',
          direction: 'out',
          fromAddress: fromAccount?.address || '',
          fromName: fromAccount?.name || '',
          to: to.trim(),
          subject: subject.trim(),
          body,
          status: 'draft',
          unread: false,
          resendId: null,
          inboundId: null,
          scheduledAt: null,
          errorMessage: null,
          attachments: [],
          createdAt: now,
          updatedAt: now,
        }
        applyMessages([message, ...messages.filter((item) => item.id !== message.id)], 'local')
        setComposeId(message.id)
      } else {
        const result = await mailbox('save', { id: composeId, accountId: fromId, to, subject, body, scheduledAt: null })
        setComposeId(result.data.message?.id ?? composeId)
        await loadMail()
      }
      setNotice('Draft saved.')
      setFolder('drafts')
    } catch (saveError: unknown) {
      setError(saveError instanceof Error ? saveError.message : 'Could not save draft')
    } finally {
      setBusy(null)
    }
  }

  async function moveSelected(next: MailFolder) {
    if (!selected) return
    setBusy('move')
    setError(null)
    try {
      if (storage === 'local') {
        applyMessages(
          messages.map((item) => (item.id === selected.id ? { ...item, folder: next, updatedAt: new Date().toISOString() } : item)),
          'local',
        )
      } else {
        await mailbox('move', { id: selected.id, folder: next })
        await loadMail()
      }
      setSelectedId(null)
      setFolder(next)
    } catch (moveError: unknown) {
      setError(moveError instanceof Error ? moveError.message : 'Could not move mail')
    } finally {
      setBusy(null)
    }
  }

  async function discardSelected() {
    if (!selected) return
    setBusy('move')
    setError(null)
    try {
      if (storage === 'local') {
        applyMessages(
          messages.filter((item) => item.id !== selected.id),
          'local',
        )
      } else if (isBroadcastActivityId(selected.id)) {
        setNotice('Broadcast activity stays in the inbox.')
      } else {
        await mailbox('discard', { id: selected.id })
        await loadMail()
      }
      setSelectedId(null)
    } catch (discardError: unknown) {
      setError(discardError instanceof Error ? discardError.message : 'Could not delete mail')
    } finally {
      setBusy(null)
    }
  }

  async function openMessage(message: DepartmentMailMessage) {
    setSelectedId(message.id)
    setPane('mail')
    setNotice(null)
    setError(null)
    const key = mailThreadKey(message)
    const unread = messages.filter((item) => item.unread && mailThreadKey(item) === key)
    if (!unread.length) return
    const mark = (item: DepartmentMailMessage) => (mailThreadKey(item) === key ? { ...item, unread: false } : item)
    if (storage === 'local') {
      applyMessages(messages.map(mark), 'local')
      return
    }
    setMessages((current) => current.map(mark))
    for (const item of unread) {
      if (isBroadcastActivityId(item.id)) continue
      void mailbox('read', { id: item.id }).catch(() => undefined)
    }
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null
      const typing = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)
      if (typing || event.metaKey || event.ctrlKey || event.altKey) return
      if (event.key === 'c') {
        event.preventDefault()
        openCompose()
        return
      }
      if (event.key !== 'j' && event.key !== 'k') return
      if (!threads.length) return
      event.preventDefault()
      const index = threads.findIndex((thread) => thread.messages.some((message) => message.id === selectedId))
      const next = event.key === 'j' ? Math.min(threads.length - 1, index + 1) : Math.max(0, index <= 0 ? 0 : index - 1)
      void openMessage(threads[next].latest)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  async function saveAccount(event: FormEvent) {
    event.preventDefault()
    if (!editingId) return
    setBusy('save')
    setError(null)
    setNotice(null)
    try {
      const res = await fetch('/api/admin/email/departments', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editingId, ...editDraft }),
      })
      const data = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(data.error || 'Could not save account')
      setEditingId(null)
      setNotice('Account saved.')
      await loadAccounts()
    } catch (saveError: unknown) {
      setError(saveError instanceof Error ? saveError.message : 'Could not save account')
    } finally {
      setBusy(null)
    }
  }

  async function addAccount(event: FormEvent) {
    event.preventDefault()
    setBusy('save')
    setError(null)
    setNotice(null)
    try {
      const res = await fetch('/api/admin/email/departments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(addDraft),
      })
      const data = (await res.json()) as { error?: string; account?: Department }
      if (!res.ok) throw new Error(data.error || 'Could not add account')
      setAddDraft(emptyAccount)
      if (data.account) setFromId(data.account.id)
      setNotice('Account added.')
      await loadAccounts()
    } catch (addError: unknown) {
      setError(addError instanceof Error ? addError.message : 'Could not add account')
    } finally {
      setBusy(null)
    }
  }

  async function removeAccount(account: Department) {
    setBusy('move')
    setError(null)
    setNotice(null)
    try {
      const res = await fetch(`/api/admin/email/departments?id=${encodeURIComponent(account.id)}`, { method: 'DELETE' })
      const data = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(data.error || 'Could not remove account')
      setNotice('Account removed.')
      await loadAccounts()
    } catch (removeError: unknown) {
      setError(removeError instanceof Error ? removeError.message : 'Could not remove account')
    } finally {
      setBusy(null)
    }
  }

  const toolPane = isDeskSection(pane)
  const settingsPane = pane === 'settings'
  const widePane = toolPane || settingsPane
  const showMailbox = pane === 'broadcasts' || !widePane
  const showReader = pane !== 'mail' || Boolean(selected)
  const folderLabel = FOLDERS.find((item) => item.id === folder)?.label || 'Mail'
  const recipientSuggestions = useMemo(() => predictMailRecipients(contacts, to), [contacts, to])
  const splitMailbox = pane === 'broadcasts'
  const searchValue = splitMailbox && searchBox === 'sent' ? sentQuery : query
  const searchSuggestions = useMemo(() => predictMailRecipients(contacts, searchValue), [contacts, searchValue])
  const inboxThreads = useMemo(
    () => groupMailThreads(filterDepartmentMail(messages, { folder: 'inbox', accountId, query })),
    [messages, accountId, query],
  )
  const sentThreads = useMemo(
    () => groupMailThreads(filterDepartmentMail(messages, { folder: 'sent', accountId, query: sentQuery })),
    [messages, accountId, sentQuery],
  )
  const folderButton = (item: (typeof FOLDERS)[number]) => {
    const count = item.id === 'inbox' ? inboxUnread : counts[item.id]
    const active = pane === 'mail' && folder === item.id
    return (
      <button
        key={item.id}
        type="button"
        onClick={() => openFolder(item.id)}
        aria-current={active ? 'page' : undefined}
        className={`flex shrink-0 items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-sm ${
          active ? 'bg-zinc-800 text-white' : 'text-zinc-300 hover:bg-zinc-900'
        }`}
      >
        {item.label}
        {count > 0 ? <span className="text-xs text-zinc-400">{count}</span> : null}
      </button>
    )
  }

  const railButton = (
    key: string,
    label: string,
    icon: string,
    active: boolean,
    onClick: () => void,
    count = 0,
    tone: 'plain' | 'compose' = 'plain',
  ) => (
    <button
      key={key}
      type="button"
      title={label}
      aria-label={count > 0 ? `${label}, ${count}` : label}
      aria-current={active ? 'page' : undefined}
      onClick={onClick}
      className={`relative flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${
        tone === 'compose'
          ? 'bg-violet-600 text-white'
          : active
            ? 'bg-zinc-800 text-white'
            : 'text-zinc-300 hover:bg-zinc-900'
      }`}
    >
      <MailNavIcon name={icon} />
      {count > 0 ? (
        <span className="absolute -right-0.5 -top-0.5 min-w-4 rounded-full bg-violet-500 px-1 text-center text-[9px] font-semibold leading-4 text-white">
          {count > 99 ? '99+' : count}
        </span>
      ) : null}
    </button>
  )

  useEffect(() => {
    const raw = window.localStorage.getItem('department-mail-broadcast-split')
    const stored = raw == null ? Number.NaN : Number(raw)
    if (Number.isFinite(stored)) setInboxShare(Math.min(78, Math.max(22, stored)))
    setNavWidth(readStoredNumber(NAV_WIDTH_KEY, 192, 148, 420))
    setListWidth(readStoredNumber(LIST_WIDTH_KEY, 320, 240, 720))
    setNavOpen(window.localStorage.getItem(NAV_OPEN_KEY) !== '0')
    setListOpen(window.localStorage.getItem(LIST_OPEN_KEY) !== '0')
    setTitleSlot(document.getElementById(APP_SHELL_TITLE_SLOT_ID))
  }, [])

  function rememberColumn(kind: 'nav' | 'list', next: number) {
    const width = kind === 'nav' ? clampColumn(next, 148, 420) : clampColumn(next, 240, 720)
    if (kind === 'nav') setNavWidth(width)
    else setListWidth(width)
    window.localStorage.setItem(kind === 'nav' ? NAV_WIDTH_KEY : LIST_WIDTH_KEY, String(width))
  }

  function toggleColumn(kind: 'nav' | 'list') {
    if (kind === 'nav') {
      setNavOpen((open) => {
        window.localStorage.setItem(NAV_OPEN_KEY, open ? '0' : '1')
        return !open
      })
      return
    }
    setListOpen((open) => {
      window.localStorage.setItem(LIST_OPEN_KEY, open ? '0' : '1')
      return !open
    })
  }

  function startColumnResize(kind: 'nav' | 'list', event: ReactPointerEvent<HTMLButtonElement>) {
    event.preventDefault()
    const startX = event.clientX
    const startWidth = kind === 'nav' ? navWidth : listWidth
    const move = (pointer: PointerEvent) => {
      rememberColumn(kind, startWidth + pointer.clientX - startX)
    }
    const stop = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', stop)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', stop)
  }

  function rememberShare(next: number) {
    const share = Math.min(78, Math.max(22, next))
    setInboxShare(share)
    window.localStorage.setItem('department-mail-broadcast-split', String(Math.round(share)))
  }

  function startSplitResize(event: ReactPointerEvent<HTMLButtonElement>) {
    event.preventDefault()
    const bounds = splitRef.current?.getBoundingClientRect()
    if (!bounds || bounds.width <= 0) return
    const move = (pointer: PointerEvent) => {
      rememberShare(((pointer.clientX - bounds.left) / bounds.width) * 100)
    }
    const stop = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', stop)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', stop)
  }

  function applySearch(email: string, box: 'list' | 'sent') {
    if (box === 'sent') setSentQuery(email)
    else setQuery(email)
    setSearchSuggestionIndex(-1)
  }

  function mailboxSearch(box: 'list' | 'sent', label: string, value: string, onValue: (next: string) => void) {
    const open = searchBox === box && searchSuggestions.length > 0 && searchSuggestionIndex >= 0
    const listId = box === 'sent' ? 'mail-search-predictions-sent' : 'mail-search-predictions'
    return (
      <div className="relative">
        <input
          value={value}
          onFocus={() => {
            setSearchBox(box)
            setSearchSuggestionIndex(0)
          }}
          onChange={(event) => {
            setSearchBox(box)
            onValue(event.target.value)
            setSearchSuggestionIndex(0)
          }}
          onKeyDown={(event) => {
            if (searchBox !== box || !searchSuggestions.length || searchSuggestionIndex < 0) return
            if (event.key === 'ArrowDown') {
              event.preventDefault()
              setSearchSuggestionIndex((index) => (index + 1) % searchSuggestions.length)
            } else if (event.key === 'ArrowUp') {
              event.preventDefault()
              setSearchSuggestionIndex((index) => (index - 1 + searchSuggestions.length) % searchSuggestions.length)
            } else if (event.key === 'Enter') {
              const pick = searchSuggestions[searchSuggestionIndex]
              if (!pick) return
              event.preventDefault()
              applySearch(pick.email, box)
            } else if (event.key === 'Escape') {
              setSearchSuggestionIndex(-1)
            }
          }}
          placeholder={`Search ${label}`}
          aria-label={`Search ${label}`}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          className="w-full rounded-md border border-zinc-800 bg-black px-3 py-2 text-sm"
        />
        {open ? (
          <ul id={listId} role="listbox" className="absolute left-0 top-full z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-zinc-700 bg-zinc-950 py-1 shadow-lg">
            {searchSuggestions.map((contact, index) => (
              <li key={contact.email} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={index === searchSuggestionIndex}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => applySearch(contact.email, box)}
                  className={`flex w-full items-baseline justify-between gap-3 px-3 py-2 text-left text-sm ${
                    index === searchSuggestionIndex ? 'bg-zinc-800 text-white' : 'text-zinc-200 hover:bg-zinc-900'
                  }`}
                >
                  <span className="truncate">{contact.name || contact.email}</span>
                  {contact.name ? <span className="truncate text-xs text-zinc-500">{contact.email}</span> : null}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    )
  }

  function threadList(items: typeof threads, columnFolder: MailFolder) {
    if (items.length === 0) {
      return <li className="px-3 py-6 text-sm text-zinc-500">No mail in {columnFolder}.</li>
    }
    return items.map((thread) => {
      const message = thread.latest
      const party = message.direction === 'in' ? message.fromName || message.fromAddress : message.to || '(no recipient)'
      const unread = thread.messages.some((item) => item.unread)
      const active = folder === columnFolder && thread.messages.some((item) => item.id === selectedId)
      return (
        <li key={thread.key}>
          <button
            type="button"
            onClick={() => {
              setFolder(columnFolder)
              void openMessage(message)
            }}
            className={`block w-full border-b border-zinc-900 px-3 py-3 text-left ${
              active ? 'bg-zinc-900' : 'hover:bg-zinc-900/70'
            }`}
          >
            <span className="flex items-baseline justify-between gap-2">
              <span className={`truncate text-sm ${unread ? 'font-semibold text-white' : 'text-zinc-200'}`}>
                {party}
                {thread.messages.length > 1 ? <span className="ml-2 text-xs font-normal text-zinc-500">{thread.messages.length}</span> : null}
              </span>
              <span className="shrink-0 text-[11px] text-zinc-500">
                {formatMailWhen(message.folder === 'scheduled' ? message.scheduledAt : message.updatedAt)}
              </span>
            </span>
            <span className={`mt-0.5 block truncate text-sm ${unread ? 'text-zinc-100' : 'text-zinc-400'}`}>
              {message.subject || '(no subject)'}
            </span>
            <span className="mt-0.5 block truncate text-xs text-zinc-500">{snippet(message.body) || message.status}</span>
          </button>
        </li>
      )
    })
  }

  return (
    <div className="flex min-h-[calc(100vh-5.5rem)] w-full flex-col px-3 py-4 text-zinc-100 sm:px-5 md:h-[calc(100vh-5.5rem)] md:overflow-hidden">
      {titleSlot
        ? createPortal(
            <div className="text-center">
              <p className="text-[11px] uppercase tracking-[0.16em] text-violet-300">{domain}</p>
              <h1 className="text-lg font-semibold leading-tight text-ink">Department mail</h1>
            </div>,
            titleSlot,
          )
        : null}

      <div className="flex min-h-0 flex-1 flex-col gap-3 md:flex-row md:overflow-hidden">
        <MailSideColumn
          open={navOpen}
          width={navWidth}
          label="folders"
          onToggle={() => toggleColumn('nav')}
          onResizeStart={(event) => startColumnResize('nav', event)}
          onNudge={(delta) => rememberColumn('nav', navWidth + delta)}
          collapsedWidth="2.75rem"
          rail={
            <>
              {railButton('compose', 'Compose', 'compose', pane === 'compose', () => openCompose(), 0, 'compose')}
              {FOLDERS.filter((item) => item.id !== 'trash').map((item) => {
                const count = item.id === 'inbox' ? inboxUnread : counts[item.id]
                return railButton(
                  item.id,
                  item.label,
                  item.id,
                  pane === 'mail' && folder === item.id,
                  () => openFolder(item.id),
                  count,
                )
              })}
              {DESK_NAV.map((item) =>
                railButton(item.id, item.label, item.id, pane === item.id, () => {
                  setPane(item.id)
                  setSelectedId(null)
                  setNotice(null)
                  setError(null)
                }),
              )}
              {FOLDERS.filter((item) => item.id === 'trash').map((item) =>
                railButton(item.id, item.label, item.id, pane === 'mail' && folder === item.id, () => openFolder(item.id), counts[item.id]),
              )}
              {railButton('settings', 'Settings', 'settings', settingsPane, () => setSettingsOpen((open) => !open))}
              {settingsOpen
                ? MAIL_SETTINGS.map((item) =>
                    railButton(item.id, item.label, item.id, settingsPane && setting === item.id, () => {
                      setSetting(item.id)
                      setPane('settings')
                      setSelectedId(null)
                      setNotice(null)
                      setError(null)
                    }),
                  )
                : null}
              {settingsOpen
                ? railButton('webhooks', 'Webhooks', 'webhooks', pane === 'webhooks', () => {
                    setPane('webhooks')
                    setSelectedId(null)
                    setNotice(null)
                    setError(null)
                  })
                : null}
            </>
          }
        >
        <nav className="flex h-full min-h-0 gap-1 overflow-x-auto pt-10 md:flex-col md:overflow-y-auto" aria-label="Mail folders">
          <div className="flex gap-1 md:flex-col">
          <button
            type="button"
            onClick={() => openCompose()}
            className="shrink-0 rounded-md bg-violet-600 px-3 py-2 text-left text-sm font-medium text-white"
          >
            Compose
          </button>
          {FOLDERS.filter((item) => item.id !== 'trash').map(folderButton)}
          {DESK_NAV.map((item) => {
            const active = pane === item.id
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setPane(item.id)
                  setSelectedId(null)
                  setNotice(null)
                  setError(null)
                }}
                aria-current={active ? 'page' : undefined}
                className={`shrink-0 rounded-md px-3 py-2 text-left text-sm ${
                  active ? 'bg-zinc-800 text-white' : 'text-zinc-300 hover:bg-zinc-900'
                }`}
              >
                {item.label}
              </button>
            )
          })}
          {FOLDERS.filter((item) => item.id === 'trash').map(folderButton)}
          <button
            type="button"
            onClick={() => setSettingsOpen((open) => !open)}
            aria-expanded={settingsOpen}
            className="flex shrink-0 items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-sm text-zinc-300 hover:bg-zinc-900"
          >
            Settings
            <span aria-hidden="true" className="text-xs text-zinc-400">{settingsOpen ? '–' : '+'}</span>
          </button>
          {settingsOpen ? (
            <>
              {MAIL_SETTINGS.map((item) => {
                const active = settingsPane && setting === item.id
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setSetting(item.id)
                      setPane('settings')
                      setSelectedId(null)
                      setNotice(null)
                      setError(null)
                    }}
                    aria-current={active ? 'page' : undefined}
                    className={`shrink-0 rounded-md px-3 py-2 text-left text-sm ${
                      active ? 'bg-zinc-800 text-white' : 'text-zinc-300 hover:bg-zinc-900'
                    }`}
                  >
                    {item.label}
                    {item.id === 'team' && departments.length ? (
                      <span className="ml-2 text-xs text-zinc-500">{departments.length}</span>
                    ) : null}
                  </button>
                )
              })}
              <button
                type="button"
                onClick={() => {
                  setPane('webhooks')
                  setSelectedId(null)
                  setNotice(null)
                  setError(null)
                }}
                aria-current={pane === 'webhooks' ? 'page' : undefined}
                className={`shrink-0 rounded-md px-3 py-2 text-left text-sm ${
                  pane === 'webhooks' ? 'bg-zinc-800 text-white' : 'text-zinc-300 hover:bg-zinc-900'
                }`}
              >
                Webhooks
              </button>
            </>
          ) : null}
          </div>
        </nav>
        </MailSideColumn>

        {showMailbox ? (
        <MailSideColumn
          open={listOpen}
          width={listWidth}
          label="mailbox"
          onToggle={() => toggleColumn('list')}
          onResizeStart={(event) => startColumnResize('list', event)}
          onNudge={(delta) => rememberColumn('list', listWidth + delta)}
          className={showReader ? 'hidden md:block' : ''}
          bodyClassName="min-h-[24rem] md:min-h-0"
        >
        <section className="flex h-full min-h-0 flex-col rounded-md border border-zinc-800 bg-zinc-950">
          <div className="border-b border-zinc-800 p-2 pl-10">
            <label className="mb-2 flex flex-col gap-1 text-center text-xs text-zinc-400">
              Mailbox
              <select
                value={accountId}
                onChange={(event) => {
                  setAccountId(event.target.value)
                  if (event.target.value !== 'all') setFromId(event.target.value)
                }}
                aria-label="Mailbox filter"
                className="w-full rounded-md border border-zinc-800 bg-black px-3 py-2 text-center text-sm text-zinc-100 [text-align-last:center]"
              >
                <option value="all">All mailboxes</option>
                {departments.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            {splitMailbox ? null : mailboxSearch('list', folderLabel.toLowerCase(), query, setQuery)}
          </div>
          {splitMailbox ? (
            <div ref={splitRef} className="flex min-h-0 flex-1">
              <div className="flex min-h-0 min-w-0 flex-col" style={{ width: `${inboxShare}%` }}>
                <div className="border-b border-zinc-800 p-2">{mailboxSearch('list', 'inbox', query, setQuery)}</div>
                <p className="border-b border-zinc-800 px-3 py-2 text-xs uppercase tracking-wide text-zinc-500">
                  Inbox{inboxUnread > 0 ? <span className="ml-2 text-zinc-400">{inboxUnread}</span> : null}
                </p>
                <ul className="min-h-0 flex-1 overflow-y-auto">{threadList(inboxThreads, 'inbox')}</ul>
              </div>
              <button
                type="button"
                role="separator"
                aria-orientation="vertical"
                aria-label="Resize inbox and sent"
                aria-valuemin={22}
                aria-valuemax={78}
                aria-valuenow={Math.round(inboxShare)}
                onPointerDown={startSplitResize}
                onKeyDown={(event) => {
                  if (event.key === 'ArrowLeft') {
                    event.preventDefault()
                    rememberShare(inboxShare - 2)
                  } else if (event.key === 'ArrowRight') {
                    event.preventDefault()
                    rememberShare(inboxShare + 2)
                  }
                }}
                className="group relative w-2 shrink-0 cursor-col-resize bg-zinc-900 hover:bg-violet-500 focus:bg-violet-500"
              >
                <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-zinc-700 group-hover:bg-violet-300" />
              </button>
              <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                <div className="border-b border-zinc-800 p-2">{mailboxSearch('sent', 'sent', sentQuery, setSentQuery)}</div>
                <p className="border-b border-zinc-800 px-3 py-2 text-xs uppercase tracking-wide text-zinc-500">Sent</p>
                <ul className="min-h-0 flex-1 overflow-y-auto">{threadList(sentThreads, 'sent')}</ul>
              </div>
            </div>
          ) : (
            <ul className="min-h-0 flex-1 overflow-y-auto">{threadList(threads, folder)}</ul>
          )}
        </section>
        </MailSideColumn>
        ) : null}

        <section className={`min-h-[28rem] min-w-0 flex-1 overflow-y-auto rounded-md border border-zinc-800 bg-black/40 p-4 md:min-h-0 ${showReader ? 'block' : 'hidden md:block'}`}>
          {showReader && !widePane ? (
            <button type="button" onClick={() => { setPane('mail'); setSelectedId(null) }} className="mb-3 text-sm text-zinc-400 md:hidden">
              Back
            </button>
          ) : null}

          {error ? <p className="mb-3 text-sm text-red-300">{error}</p> : null}
          {notice ? <p className="mb-3 text-sm text-emerald-300">{notice}</p> : null}

          {settingsPane && isMailSetting(setting) && setting !== 'team' ? (
            <DepartmentMailSettings
              setting={setting}
              domain={domain}
              sentCount={messages.filter((message) => message.folder === 'sent').length}
            />
          ) : null}

          <div className={toolPane ? undefined : 'hidden'}>
            <DepartmentMailHub
              pane={isDeskSection(pane) ? pane : deskPane}
              departments={departments}
              accountId={accountId}
              messages={messages}
              onCompose={(seed) => openCompose(seed)}
              onAccountChange={(id) => {
                setAccountId(id)
                if (id !== 'all') setFromId(id)
              }}
            />
          </div>

          {pane === 'compose' ? (
            <>
            <form onSubmit={onSend} className="space-y-3">
              <h2 className="text-center text-sm font-medium text-zinc-300">Compose</h2>
              <label className="block text-sm">
                <span className="text-zinc-400">From</span>
                <select
                  value={fromId}
                  onChange={(event) => setFromId(event.target.value)}
                  className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2"
                >
                  {departments.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} — {item.address}
                    </option>
                  ))}
                </select>
                {fromAccount?.purpose ? <span className="mt-1 block text-xs text-zinc-500">{fromAccount.purpose}</span> : null}
              </label>
              <label className="relative block text-sm">
                <span className="text-zinc-400">To</span>
                <input
                  value={to}
                  onChange={(event) => {
                    setTo(event.target.value)
                    setSuggestionIndex(0)
                  }}
                  onKeyDown={(event) => {
                    if (!recipientSuggestions.length) return
                    if (event.key === 'ArrowDown') {
                      event.preventDefault()
                      setSuggestionIndex((index) => (index + 1) % recipientSuggestions.length)
                    } else if (event.key === 'ArrowUp') {
                      event.preventDefault()
                      setSuggestionIndex((index) => (index - 1 + recipientSuggestions.length) % recipientSuggestions.length)
                    } else if (event.key === 'Enter' || event.key === 'Tab') {
                      const pick = recipientSuggestions[suggestionIndex]
                      if (!pick) return
                      event.preventDefault()
                      setTo(applyMailRecipient(to, pick.email))
                      setSuggestionIndex(0)
                    } else if (event.key === 'Escape') {
                      setSuggestionIndex(-1)
                    }
                  }}
                  placeholder="name@example.com, second@example.com"
                  aria-label="To"
                  role="combobox"
                  aria-expanded={recipientSuggestions.length > 0 && suggestionIndex >= 0}
                  aria-controls="mail-to-predictions"
                  aria-autocomplete="list"
                  className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2"
                  required
                />
                {recipientSuggestions.length > 0 && suggestionIndex >= 0 ? (
                  <ul id="mail-to-predictions" role="listbox" className="absolute left-0 top-full z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-zinc-700 bg-zinc-950 py-1 shadow-lg">
                    {recipientSuggestions.map((contact, index) => (
                      <li key={contact.email} role="presentation">
                        <button
                          type="button"
                          role="option"
                          aria-selected={index === suggestionIndex}
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => {
                            setTo(applyMailRecipient(to, contact.email))
                            setSuggestionIndex(0)
                          }}
                          className={`flex w-full items-baseline justify-between gap-3 px-3 py-2 text-left text-sm ${
                            index === suggestionIndex ? 'bg-zinc-800 text-white' : 'text-zinc-200 hover:bg-zinc-900'
                          }`}
                        >
                          <span className="truncate">{contact.name || contact.email}</span>
                          {contact.name ? <span className="truncate text-xs text-zinc-500">{contact.email}</span> : null}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </label>
              <label className="block text-sm">
                <span className="text-zinc-400">Subject</span>
                <input
                  value={subject}
                  onChange={(event) => setSubject(event.target.value)}
                  maxLength={200}
                  aria-label="Subject"
                  className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2"
                  required
                />
              </label>
              {snippets.length ? (
                <div className="flex flex-wrap gap-2">
                  {snippets.map((snippetItem) => (
                    <button
                      key={snippetItem.id}
                      type="button"
                      onClick={() => applySnippet(snippetItem)}
                      className="rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-300"
                    >
                      {snippetItem.label}
                    </button>
                  ))}
                </div>
              ) : null}
              <label className="block text-sm">
                <span className="text-zinc-400">Message</span>
                <div className="mt-1 overflow-hidden rounded-md border border-zinc-700 bg-zinc-950">
                  {mailDraft.blocks.length ? (
                    <div className="space-y-3 border-b border-zinc-800 p-3">
                      {mailDraft.blocks.map((block, index) => (
                        <div key={`${block.kind}-${index}`} className="flex items-start gap-3">
                          <div className="min-w-0 flex-1">
                            <MailBlockView block={block} onChange={(next) => updateMailBlock(index, next)} />
                          </div>
                          <button type="button" aria-label={`Remove ${block.kind === 'link' ? block.label : block.title}`} onClick={() => removeMailBlock(index)} className="text-sm text-zinc-500">
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  <textarea
                    value={mailDraft.prose}
                    onChange={(event) => setBody(composeMailBody(event.target.value, mailDraft.blocks))}
                    rows={10}
                    aria-label="Message"
                    placeholder="Write the note. Cover, tracks, codes, press, and links land here."
                    className="w-full bg-transparent px-3 py-2"
                    required={mailDraft.blocks.length === 0}
                  />
                </div>
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <label className="cursor-pointer rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-300">
                  Attach
                  <input
                    type="file"
                    multiple
                    className="sr-only"
                    aria-label="Attach files"
                    onChange={(event) => {
                      addFiles(event.target.files)
                      event.target.value = ''
                    }}
                  />
                </label>
                {[
                  ...promoKindsForAccount(fromId).map((kind) => ({
                    id: kind,
                    label: promoAssetLabel(kind),
                    items: promoMenuItems(promoReleases, kind, `${subject}\n${body}`, promoToday),
                  })),
                  ...extraComposeMenus(promoReleases, `${subject}\n${body}`, promoToday, fromId),
                ].map((menu) => (
                    <PromoAssetMenu
                      key={menu.id}
                      menuId={menu.id}
                      label={menu.label}
                      items={menu.items}
                      open={promoKind === menu.id}
                      activeIndex={promoIndex}
                      onOpen={(next) => {
                        if (next && !menu.items.length) {
                          setPromoKind(null)
                          setError(`No ${menu.label.toLowerCase()} is ready for this draft.`)
                          return
                        }
                        setError(null)
                        setPromoKind(next)
                        if (next) setPromoIndex(0)
                      }}
                      onActive={setPromoIndex}
                      onPick={attachPromoItem}
                    />
                  ))}
                {files.map((file) => (
                  <span key={`${file.name}-${file.size}-${file.lastModified}`} className="inline-flex items-center gap-1 rounded-md bg-zinc-900 px-2 py-1 text-xs text-zinc-300">
                    <button
                      type="button"
                      onClick={() => setPreviewFile(file)}
                      className="max-w-[14rem] truncate text-left hover:text-white"
                      title="Open this file, then replace it if you need a new version"
                    >
                      {file.name}
                    </button>
                    <button
                      type="button"
                      aria-label={`Remove ${file.name}`}
                      onClick={() => {
                        setFiles((current) => current.filter((item) => item !== file))
                        setPreviewFile((current) => (current === file ? null : current))
                      }}
                      className="text-zinc-500"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
              {scheduleOn ? (
                <label className="block text-sm">
                  <span className="text-zinc-400">Send at</span>
                  <input
                    type="datetime-local"
                    value={scheduleAt}
                    onChange={(event) => setScheduleAt(event.target.value)}
                    aria-label="Send at"
                    className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2"
                    required
                  />
                </label>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => void saveDraft()} disabled={busy !== null} className="rounded-md border border-zinc-600 px-3 py-2 text-sm disabled:opacity-50">
                  {busy === 'save' ? 'Saving…' : 'Save draft'}
                </button>
                <button type="button" onClick={() => setScheduleOn((on) => !on)} className="rounded-md px-3 py-2 text-sm text-zinc-300">
                  {scheduleOn ? 'Send now' : 'Schedule'}
                </button>
                <button type="submit" disabled={busy !== null || departments.length === 0} className="ml-auto rounded-md bg-violet-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
                  {busy === 'send' ? 'Working…' : scheduleOn ? 'Schedule' : 'Send'}
                </button>
              </div>
            </form>
            {previewFile && previewUrl ? (
              <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-label={previewFile.name}>
                <div className="flex h-[min(82vh,760px)] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-zinc-700 bg-zinc-950 shadow-xl">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 px-3 py-2">
                    <p className="min-w-0 truncate text-sm text-zinc-200">{previewFile.name}</p>
                    <div className="flex items-center gap-2">
                      {isPdfFile(previewFile) ? (
                        <button type="button" onClick={updateComposePdf} className="rounded-md bg-violet-600 px-2 py-1 text-xs text-white">
                          Update PDF
                        </button>
                      ) : null}
                      <label className="cursor-pointer rounded-md border border-zinc-600 px-2 py-1 text-xs text-zinc-100">
                        Replace file
                        <input
                          type="file"
                          accept={isPdfFile(previewFile) ? 'application/pdf,.pdf' : undefined}
                          className="sr-only"
                          aria-label={`Replace ${previewFile.name}`}
                          onChange={(event) => {
                            replaceComposeFile(previewFile, event.target.files?.[0] || null)
                            event.target.value = ''
                          }}
                        />
                      </label>
                      <button type="button" onClick={() => setPreviewFile(null)} className="rounded-md px-2 py-1 text-xs text-zinc-400">
                        Close
                      </button>
                    </div>
                  </div>
                  {isPdfFile(previewFile) ? (
                    <textarea
                      value={previewText}
                      onChange={(event) => setPreviewText(event.target.value)}
                      aria-label={`Edit ${previewFile.name}`}
                      className="min-h-0 w-full flex-1 resize-none bg-zinc-950 px-4 py-3 font-mono text-sm leading-6 text-zinc-100"
                    />
                  ) : previewUrl ? (
                    <iframe title={previewFile.name} src={previewUrl} className="min-h-0 w-full flex-1 bg-white" />
                  ) : null}
                </div>
              </div>
            ) : null}
            </>
          ) : null}

          {settingsPane && setting === 'team' ? (
            <div className="space-y-3">
              <h2 className="text-sm font-medium text-zinc-300">Team</h2>
              <p className="text-sm text-zinc-500">
                Each department sends as its own mailbox. Replies go back to the address you send from, and the domain has to stay verified in Resend.
              </p>
              <ul className="space-y-2">
                {departments.map((account) => (
                  <li key={account.id} className="rounded-md border border-zinc-800 bg-zinc-950 px-3 py-3">
                    {editingId === account.id ? (
                      <form onSubmit={saveAccount} className="grid gap-2 sm:grid-cols-2">
                        <input value={editDraft.name} onChange={(event) => setEditDraft({ ...editDraft, name: event.target.value })} aria-label="Display name" className="rounded-md border border-zinc-700 bg-black px-3 py-2 text-sm" required />
                        <input value={editDraft.localPart} onChange={(event) => setEditDraft({ ...editDraft, localPart: event.target.value })} aria-label="Mailbox" className="rounded-md border border-zinc-700 bg-black px-3 py-2 text-sm" required />
                        <input value={editDraft.purpose} onChange={(event) => setEditDraft({ ...editDraft, purpose: event.target.value })} aria-label="Purpose" className="rounded-md border border-zinc-700 bg-black px-3 py-2 text-sm sm:col-span-2" />
                        <div className="flex gap-2 sm:col-span-2">
                          <button type="submit" disabled={busy !== null} className="rounded-md bg-violet-600 px-3 py-1.5 text-sm disabled:opacity-50">Save</button>
                          <button type="button" onClick={() => setEditingId(null)} className="rounded-md px-3 py-1.5 text-sm text-zinc-400">Cancel</button>
                        </div>
                      </form>
                    ) : (
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium">{account.name}</p>
                          <p className="text-sm text-violet-200">{account.address}</p>
                          {account.purpose ? <p className="mt-1 text-xs text-zinc-500">{account.purpose}</p> : null}
                        </div>
                        <div className="flex shrink-0 gap-2">
                          <button type="button" onClick={() => { setEditingId(account.id); setEditDraft({ name: account.name, localPart: account.localPart, purpose: account.purpose }) }} className="text-sm text-zinc-300">Edit</button>
                          {account.builtin ? null : (
                            <button type="button" onClick={() => void removeAccount(account)} disabled={busy !== null} className="text-sm text-red-300 disabled:opacity-50">Remove</button>
                          )}
                        </div>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
              <form onSubmit={addAccount} className="grid gap-2 rounded-md border border-dashed border-zinc-700 p-3 sm:grid-cols-2">
                <p className="text-sm text-zinc-400 sm:col-span-2">New account</p>
                <input value={addDraft.name} onChange={(event) => setAddDraft({ ...addDraft, name: event.target.value })} placeholder="Display name" aria-label="New display name" className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm" required />
                <input value={addDraft.localPart} onChange={(event) => setAddDraft({ ...addDraft, localPart: event.target.value })} placeholder={`mailbox@${domain}`} aria-label="New mailbox" className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm" required />
                <input value={addDraft.purpose} onChange={(event) => setAddDraft({ ...addDraft, purpose: event.target.value })} placeholder="What this mailbox is for" aria-label="New purpose" className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm sm:col-span-2" />
                <button type="submit" disabled={busy !== null} className="w-fit rounded-md border border-zinc-600 px-3 py-1.5 text-sm disabled:opacity-50">Add account</button>
              </form>
            </div>
          ) : null}

          {pane === 'mail' && selected ? (
            <div>
              {selectedThread.map((message, index) => (
                <article key={message.id} className={index < selectedThread.length - 1 ? 'mb-6 border-b border-zinc-800 pb-6' : ''}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <h2 className="text-lg font-semibold">{message.subject || '(no subject)'}</h2>
                    <span className="text-xs uppercase tracking-wide text-zinc-500">{message.status}</span>
                  </div>
                  <p className="mt-2 text-sm text-zinc-300">
                    {message.fromName ? `${message.fromName} ` : null}
                    <span className="text-zinc-500">&lt;{message.fromAddress}&gt;</span>
                  </p>
                  <p className="text-sm text-zinc-500">To {message.to || '—'}</p>
                  {message.errorMessage ? <p className="mt-2 text-sm text-red-300">{message.errorMessage}</p> : null}
                  {message.attachments.length ? (
                    <ul className="mt-2 flex flex-wrap gap-2">
                      {message.attachments.map((file) => (
                        <li key={`${message.id}-${file.filename}`}>
                          {file.href ? (
                            <a
                              href={file.href}
                              className="inline-block rounded-md bg-zinc-900 px-2 py-1 text-xs text-violet-200 hover:text-violet-100"
                            >
                              {file.filename}
                            </a>
                          ) : (
                            <span className="inline-block rounded-md bg-zinc-900 px-2 py-1 text-xs text-zinc-300">
                              {file.filename}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  <RenderedMail body={message.body} />
                </article>
              ))}
              <div className="mt-6 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() =>
                    openCompose({
                      accountId: selected.accountId,
                      to: selected.direction === 'in' ? selected.fromAddress : selected.to,
                      subject: replySubject(selected.subject),
                      body: `\n\nOn ${formatMailWhen(selected.updatedAt)}, ${selected.fromName || selected.fromAddress} wrote:\n${selected.body}`,
                    })
                  }
                  className="rounded-md bg-violet-600 px-3 py-1.5 text-sm"
                >
                  Reply
                </button>
                {selected.folder === 'drafts' || selected.folder === 'scheduled' ? (
                  <button type="button" onClick={() => openCompose(selected)} className="rounded-md border border-zinc-600 px-3 py-1.5 text-sm">
                    Edit
                  </button>
                ) : null}
                {selected.folder === 'trash' ? (
                  <button type="button" onClick={() => void discardSelected()} disabled={busy !== null} className="rounded-md px-3 py-1.5 text-sm text-red-300 disabled:opacity-50">
                    Delete forever
                  </button>
                ) : (
                  <button type="button" onClick={() => void moveSelected('trash')} disabled={busy !== null} className="rounded-md px-3 py-1.5 text-sm text-zinc-300 disabled:opacity-50">
                    Trash
                  </button>
                )}
              </div>
            </div>
          ) : null}

          {pane === 'mail' && !selected ? (
            <div className="flex h-full min-h-48 items-center justify-center text-sm text-zinc-500">
              {folder === 'inbox'
                ? 'Replies to these addresses show up here once Resend receiving is on for sergikdropz.com.'
                : folder === 'scheduled'
                  ? 'Scheduled mail goes out about every 15 minutes, even if this desk is closed.'
                  : `Select a message in ${folderLabel.toLowerCase()}, or press C to compose.`}
            </div>
          ) : null}
        </section>
      </div>
    </div>
  )
}
