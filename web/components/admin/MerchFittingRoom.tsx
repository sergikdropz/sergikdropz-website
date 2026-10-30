'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import {
  MERCH_BLANKS,
  getBlank,
  type BlankColor,
  type BlankPlacement,
  type MerchBlank,
  type PlacementId,
} from '@/lib/merch/blanks'
import { merchArtIdFromUrl, sameMerchArt, withArtVersion } from '@/lib/merch/art-url'
import { createSupabaseClient } from '@/lib/supabase'
import type { StudioDockTool } from '@/components/admin/MerchStudioDock'
import MerchPrintfulCatalog, {
  CATALOG_PANEL_COLLAPSED_WIDTH,
  PanelChevron,
  readCatalogPanelCollapsed,
} from '@/components/admin/MerchPrintfulCatalog'
import MerchPrintfulSetupPanel, {
  type PrintfulReadyStatus,
} from '@/components/admin/MerchPrintfulSetupPanel'
import MerchProductSpecs from '@/components/admin/MerchProductSpecs'
import {
  DesignSaveRow,
  MerchDesignCanvas,
  MerchDesignSidebar,
  type DesignStageToolbarProps,
  StageModeSwitch,
  placementTabLabel,
  placementViewName,
  type DesignNavId,
  type PlacementView,
  type StageView,
} from '@/components/admin/MerchDesignMaker'
import { sumCatalogAddOnRows, usedCatalogAddOnRows } from '@/lib/merch/catalog-add-ons'
import {
  embroideryThreadMatchNote as threadMatchNote,
  matchingEmbroideryThread,
  resolveEmbroideryThreads,
  sampleArtworkThreadColors,
  threadOptionIdForFile,
  toggleEmbroideryThread,
} from '@/lib/merch/embroidery-threads'
import {
  conflictingPlacementProblems,
  openingPrintFile,
} from '@/lib/merch/catalog-design-intel'
import { buildDesignTabs, placementFileToOpen } from '@/lib/merch/design-tabs'
import {
  productMatColor,
  productMatKey,
  readProductMats,
  readStudioDesignId,
  resolveProductMat,
  writeAllProductMats,
  writeOpenTab,
  writeProductMat,
  writeStudioDesignId,
  type ProductMatMap,
} from '@/lib/merch/studio-session'
import { channelLuma, hexToRgb } from '@/lib/merch/product-mat'
import MerchLeaveDesignDialog from '@/components/admin/MerchLeaveDesignDialog'
import MerchArtEditor from '@/components/admin/MerchArtEditor'
import StudioContextMenu, {
  type StudioContextMenuEntry,
} from '@/components/studio/StudioContextMenu'
import type { CatalogProductDetail, PrintfulCatalogProduct } from '@/lib/merch/printful-catalog-types'
import {
  coloredTemplate,
  designGarmentImage,
  positioningPatternUrl,
  filterPrintFilesForTechnique,
  hasTemplateStage,
  techniqueForSavedFile,
  pickPreviewVariant,
  placementForPrintFile,
  previewGarmentImage,
  resolveBlankForCatalogProduct,
  orderPrintFilesByAngles,
  sameColorKey,
  restoreCatalogFileLayers,
  studioPlacementsForTechnique,
} from '@/lib/merch/catalog-studio'
import { snapArtInPrintArea, snapRotation, type SnapGuides } from '@/lib/merch/placement-snap'
import { removeSolidBackground } from '@/lib/merch/remove-background'
import {
  artOutside,
  containPlacement,
  designPlacementIssues,
  EMBROIDERY_SAFE_INCHES,
  fitPlacement,
  isEmbroideryFileType,
  maxScaleInMitigation,
  nativePrintScale,
  optimizePlacementForPrint,
  stitchInsets,
  dpiGrade,
  effectiveDpi,
  placementKey,
  previewArtPlacement,
  suggestRetail,
  youKeep,
  type ArtPlacement,
  type DesignStatus,
  type MerchDesign,
} from '@/lib/merch/design'

type ArtUpload = { id: string; label: string; url: string; origin?: 'user' | 'printful' }

type ArtContextMenu =
  | { target: 'stage'; x: number; y: number }
  | { target: 'upload'; x: number; y: number; upload: ArtUpload }

const CATALOG_COLUMN_WIDTH_KEY = 'sergwear-catalog-column-width'
const CATALOG_COLUMN_DEFAULT = 480
const CATALOG_COLUMN_MIN = 360
const CATALOG_COLUMN_MAX = 720
const DESIGN_PANEL_COLLAPSED_KEY = 'sergwear-design-panel-collapsed'
const DESIGN_PANEL_COLLAPSED_WIDTH = 44
const DESIGN_PANEL_WIDTH = 440

function readDesignPanelCollapsed(): boolean {
  if (typeof window === 'undefined') return false
  return window.localStorage.getItem(DESIGN_PANEL_COLLAPSED_KEY) === '1'
}
function readStoredNumber(key: string, fallback: number, min: number, max: number): number {
  if (typeof window === 'undefined') return fallback
  const stored = Number(window.localStorage.getItem(key))
  if (!Number.isFinite(stored)) return fallback
  return Math.min(max, Math.max(min, stored))
}


type LayersState = Partial<Record<PlacementId, ArtPlacement>>
type CatalogLayersState = Record<string, ArtPlacement>

type StudioSnapshot = {
  layers: LayersState
  catalogFileLayers: CatalogLayersState
}

function cloneLayers(layers: LayersState): LayersState {
  return JSON.parse(JSON.stringify(layers)) as LayersState
}

function cloneStudioSnapshot(snapshot: StudioSnapshot): StudioSnapshot {
  return {
    layers: cloneLayers(snapshot.layers),
    catalogFileLayers: JSON.parse(JSON.stringify(snapshot.catalogFileLayers)) as CatalogLayersState,
  }
}

function studioSnapshotFrom(layers: LayersState, catalogFileLayers: CatalogLayersState): StudioSnapshot {
  return cloneStudioSnapshot({ layers, catalogFileLayers })
}

function loadImage(url: string, cors = false): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    if (cors) image.crossOrigin = 'anonymous'
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Could not read that image'))
    image.src = url
  })
}

function requestWithProgress(
  url: string,
  init: { method: string; body: XMLHttpRequestBodyInit; headers?: Record<string, string> },
  onProgress: (loaded: number, total: number) => void,
): Promise<{ ok: boolean; status: number; text: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open(init.method, url)
    for (const [key, value] of Object.entries(init.headers || {})) xhr.setRequestHeader(key, value)
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded, event.total)
    }
    xhr.onload = () => resolve({ ok: xhr.status >= 200 && xhr.status < 300, status: xhr.status, text: xhr.responseText || '' })
    xhr.onerror = () => reject(new Error('Upload failed'))
    xhr.send(init.body)
  })
}

export default function MerchFittingRoom({
  stageView,
  onStageViewChange,
}: {
  stageView: StageView
  onStageViewChange: (view: StageView) => void
}) {
  const [blankId, setBlankId] = useState(MERCH_BLANKS[0].id)
  const blank = getBlank(blankId) || MERCH_BLANKS[0]
  const [placementId, setPlacementId] = useState<PlacementId>('front')
  const [layers, setLayers] = useState<Partial<Record<PlacementId, ArtPlacement>>>({})
  const [colors, setColors] = useState<string[]>(blank.defaultColors)
  const [sizes, setSizes] = useState<string[]>(blank.defaultSizes)
  const [previewColor, setPreviewColor] = useState(blank.colors[0]?.hex || '#1a1a1a')
  const [pickedColorName, setPickedColorName] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [price, setPrice] = useState(suggestRetail(blank.estimatedCost))
  const [priceTouched, setPriceTouched] = useState(false)
  const [designId, setDesignId] = useState<string | null>(null)
  const [status, setStatus] = useState<DesignStatus>('draft')
  const [note, setNote] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [uploadProgress, setUploadProgress] = useState<number | null>(null)
  const [publishProgress, setPublishProgress] = useState<{ value: number; label: string } | null>(null)
  const publishRun = useRef(0)
  const printFileUrlsRef = useRef<Record<string, string>>({})
  const [uploads, setUploads] = useState<ArtUpload[]>([])
  const [saved, setSaved] = useState<MerchDesign[]>([])
  const [savedReady, setSavedReady] = useState(false)
  const [guardOn, setGuardOn] = useState(false)
  const [baselineTick, setBaselineTick] = useState(0)
  const [cleanSnapshot, setCleanSnapshot] = useState<string | null>(null)
  const [leavePrompt, setLeavePrompt] = useState<{
    detail: string
    run: () => Promise<void>
  } | null>(null)
  const [mockupUrls, setMockupUrls] = useState<string[]>([])
  const [mockupUrlsByColor, setMockupUrlsByColor] = useState<Record<string, string[]>>({})
  const [mockupAngleTitlesByColor, setMockupAngleTitlesByColor] = useState<Record<string, string[]>>({})
  /** Garment color the stored Printful photos were made in. */
  const [mockupColor, setMockupColor] = useState<string | null>(null)
  /** Color name for those photos. Two-tone colors share one hex. */
  const [mockupColorName, setMockupColorName] = useState<string | null>(null)
  const [printFileUrls, setPrintFileUrls] = useState<Record<string, string>>({})
  const [standIn, setStandIn] = useState(true)
  const [photoPick, setPhotoPick] = useState<number | null>(null)
  /** View zoom for the preview garment. Does not change print size. */
  const [stageZoom, setStageZoom] = useState(1)
  const [dragging, setDragging] = useState(false)
  const [snapGuides, setSnapGuides] = useState<SnapGuides>({ vertical: [], horizontal: [] })
  const [showRotationGuides, setShowRotationGuides] = useState(false)
  const rotateHoldRef = useRef<number | null>(null)
  const snapGuideTimer = useRef<number | null>(null)
  const [guideFlash, setGuideFlash] = useState(false)
  const guideTimer = useRef<number | null>(null)
  const [costLive, setCostLive] = useState(false)
  const [wholesale, setWholesale] = useState(blank.estimatedCost)
  const areaRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ x: number; y: number; clientX: number; clientY: number } | null>(null)
  const uploadInputRef = useRef<HTMLInputElement>(null)
  const undoRef = useRef<StudioSnapshot[]>([])
  const redoRef = useRef<StudioSnapshot[]>([])
  const dragSnapshotRef = useRef<StudioSnapshot | null>(null)
  const sliderSnapshotRef = useRef<StudioSnapshot | null>(null)
  const [historyTick, setHistoryTick] = useState(0)
  const [dockTool, setDockTool] = useState<StudioDockTool | null>(null)
  const [guidePinned, setGuidePinned] = useState(false)
  const [catalogProductId, setCatalogProductId] = useState<number | null>(blank.catalogHintId)
  const [catalogColors, setCatalogColors] = useState<BlankColor[] | null>(null)
  const [catalogSizes, setCatalogSizes] = useState<string[] | null>(null)
  const [catalogStudio, setCatalogStudio] = useState<CatalogProductDetail | null>(null)
  const [catalogTechnique, setCatalogTechnique] = useState('DTG')
  const [activePrintFileType, setActivePrintFileType] = useState<string>('')
  const [catalogFileLayers, setCatalogFileLayers] = useState<Record<string, ArtPlacement>>({})
  const [embroideryUnlimitedColor, setEmbroideryUnlimitedColor] = useState(false)
  const [embroideryThreads, setEmbroideryThreads] = useState<Record<string, string[]>>({})
  const [embroideryThreadNote, setEmbroideryThreadNote] = useState<string | null>(null)
  const [previewSize, setPreviewSize] = useState('M')
  const [printfulReady, setPrintfulReady] = useState<PrintfulReadyStatus | null>(null)
  const [catalogColumnWidth, setCatalogColumnWidth] = useState(CATALOG_COLUMN_DEFAULT)
  const [catalogColumnResizing, setCatalogColumnResizing] = useState(false)
  const [catalogPanelCollapsed, setCatalogPanelCollapsed] = useState(false)
  const [designPanelCollapsed, setDesignPanelCollapsed] = useState(false)
  const [designNav, setDesignNav] = useState<DesignNavId>('product')
  const [guidelinesOpen, setGuidelinesOpen] = useState(false)
  const [studioGridXl, setStudioGridXl] = useState(false)
  const catalogColumnResizeRef = useRef<{ startX: number; startWidth: number } | null>(null)
  const [cardRotate, setCardRotate] = useState(0)
  const [spinTransition, setSpinTransition] = useState(true)
  const [isSpinning, setIsSpinning] = useState(false)
  const [artMenu, setArtMenu] = useState<ArtContextMenu | null>(null)
  const [productMats, setProductMats] = useState<ProductMatMap>({})
  const [stageToneMenu, setStageToneMenu] = useState<{ x: number; y: number } | null>(null)
  const [viewingArt, setViewingArt] = useState<string | null>(null)
  const [editingArt, setEditingArt] = useState<string | null>(null)
  const layersRef = useRef(layers)
  layersRef.current = layers
  const catalogFileLayersRef = useRef(catalogFileLayers)
  catalogFileLayersRef.current = catalogFileLayers
  const manualThreadKey = useRef<string | null>(null)
  const threadDetectToken = useRef(0)

  const techniquePrintFiles = useMemo(
    () =>
      catalogStudio ? filterPrintFilesForTechnique(catalogStudio.printFiles, catalogTechnique) : [],
    [catalogStudio, catalogTechnique]
  )

  const garmentPlacements = useMemo(
    () =>
      catalogStudio
        ? studioPlacementsForTechnique(catalogStudio, blank, catalogTechnique)
        : blank.placements,
    [catalogStudio, blank, catalogTechnique]
  )

  const designTabs = useMemo(() => {
    const preferTypes = Object.entries(catalogFileLayers)
      .filter(([, art]) => Boolean(art?.assetUrl))
      .map(([type]) => type)
    return buildDesignTabs(techniquePrintFiles, garmentPlacements, { preferTypes })
  }, [techniquePrintFiles, garmentPlacements, catalogFileLayers])

  const activePrintFile =
    techniquePrintFiles.find((file) => file.type === activePrintFileType) || techniquePrintFiles[0]

  const catalogArea = useMemo(
    () => (activePrintFile ? placementForPrintFile(activePrintFile, blank) : null),
    [activePrintFile, blank]
  )

  const area =
    catalogArea || garmentPlacements.find((item) => item.id === placementId) || garmentPlacements[0]

  const layer =
    catalogStudio && activePrintFile
      ? catalogFileLayers[activePrintFile.type]
      : layers[area.id]

  useEffect(() => {
    const moved = (before: ArtPlacement, after: ArtPlacement) =>
      Math.abs(after.x - before.x) > 0.0005 ||
      Math.abs(after.y - before.y) > 0.0005 ||
      Math.abs(after.scale - before.scale) > 0.0005
    const boundaryNote = (printfulType: string | undefined) =>
      isEmbroideryFileType(printfulType)
        ? `Embroidery was pulled inside the ${EMBROIDERY_SAFE_INCHES}″ stitch margin so the print file matches what Printful stitches.`
        : 'Art was pulled inside the print area so the print file matches what Printful prints.'

    if (catalogStudio) {
      const current = catalogFileLayersRef.current
      let changed = false
      let activeMoved = false
      const next = { ...current }
      for (const file of techniquePrintFiles) {
        const art = current[file.type]
        if (!art?.assetUrl) continue
        const contained = containPlacement(art, placementForPrintFile(file, blank))
        if (!moved(art, contained)) continue
        next[file.type] = contained
        changed = true
        if (file.type === activePrintFile?.type) activeMoved = true
      }
      if (!changed) return
      if (activeMoved) setNote(boundaryNote(activePrintFile?.type))
      setCatalogFileLayers(next)
      return
    }

    const currentLayers = layersRef.current
    let changed = false
    let activeMoved = false
    const nextLayers = { ...currentLayers }
    for (const item of garmentPlacements) {
      const art = currentLayers[item.id]
      if (!art?.assetUrl) continue
      const contained = containPlacement(art, item)
      if (!moved(art, contained)) continue
      nextLayers[item.id] = contained
      changed = true
      if (item.id === area.id) activeMoved = true
    }
    if (!changed) return
    if (activeMoved) setNote(boundaryNote(area.printfulType))
    setLayers(nextLayers)
  }, [catalogStudio, techniquePrintFiles, blank, activePrintFile?.type, garmentPlacements, area.id])

  useEffect(() => {
    if (!garmentPlacements.some((item) => item.id === placementId)) {
      setPlacementId(garmentPlacements[0]?.id || 'front')
    }
  }, [garmentPlacements, placementId])

  const refreshUploads = useCallback(() => {
    fetch('/api/admin/merch/art')
      .then(async (res) => {
        if (!res.ok) return
        const data = await res.json()
        setUploads(Array.isArray(data?.uploads) ? data.uploads : [])
      })
      .catch(() => undefined)
  }, [])

  const refreshSaved = useCallback(() => {
    fetch('/api/admin/merch/designs')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setSaved(data?.designs || []))
      .catch(() => undefined)
      .finally(() => setSavedReady(true))
  }, [])

  const refreshPrintfulStatus = useCallback((): Promise<void> => {
    return fetch('/api/admin/merch/printful-status', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data) return
        setPrintfulReady({
          canPublish: Boolean(data.canPublish),
          catalogSynced: Boolean(data.catalogSynced),
          catalogStale: Boolean(data.catalogStale),
          hasApiKey: Boolean(data.hasApiKey),
          hasStoreId: Boolean(data.hasStoreId),
          apiKeyValid: Boolean(data.apiKeyValid),
          apiError: typeof data.apiError === 'string' ? data.apiError : null,
          storeId: typeof data.storeId === 'number' ? data.storeId : null,
          storeMatch: data.storeMatch ?? null,
          stores: Array.isArray(data.stores) ? data.stores : [],
          templatesReachable:
            data.templatesReachable === null || data.templatesReachable === undefined
              ? null
              : Boolean(data.templatesReachable),
          publicArtOrigin: Boolean(data.publicArtOrigin),
        })
      })
      .catch(() => undefined)
      .then(() => undefined)
  }, [])

  const templateRefetchDone = useRef<Set<number>>(new Set())

  useEffect(() => {
    refreshUploads()
    refreshSaved()
    fetch('/api/admin/merch/catalog?limit=1').catch(() => undefined)
    refreshPrintfulStatus()
  }, [refreshUploads, refreshSaved, refreshPrintfulStatus])

  useEffect(() => {
    if (!printfulReady?.hasApiKey) return
    templateRefetchDone.current.clear()
  }, [printfulReady?.hasApiKey])

  useEffect(() => {
    if (!printfulReady?.hasApiKey || !catalogProductId) return
    const hasCalibratedStage = catalogStudio?.printFiles.some(
      (file) => file.mockupStage || file.templateUrl
    )
    const needsVariantTemplates = catalogStudio?.printFiles.some(
      (file) => file.templateUrl && !file.variantTemplates
    )
    const needsDesignIntel = Boolean(catalogStudio && !catalogStudio.designIntel)
    if (hasCalibratedStage && !needsVariantTemplates && !needsDesignIntel) return
    if (templateRefetchDone.current.has(catalogProductId)) return
    templateRefetchDone.current.add(catalogProductId)
    let cancelled = false
    fetch(`/api/admin/merch/catalog/${catalogProductId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((detail: CatalogProductDetail | null) => {
        if (cancelled || !detail?.product) return
        setCatalogStudio(detail)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [printfulReady?.hasApiKey, catalogProductId, catalogStudio?.printFiles])

  useEffect(() => {
    if (!catalogStudio) return
    const swatches = catalogColors && catalogColors.length > 0 ? catalogColors : blank.colors
    const colorName =
      (pickedColorName && swatches.some((color) => color.name === pickedColorName) && pickedColorName) ||
      swatches.find((color) => color.hex.toLowerCase() === previewColor.toLowerCase())?.name ||
      colors[0] ||
      ''
    const variant = pickPreviewVariant(catalogStudio.variants, colorName, previewSize)
    const variantCost = Number(variant?.price)
    if (Number.isFinite(variantCost) && variantCost > 0) {
      setWholesale(variantCost)
      setCostLive(true)
    }
  }, [catalogStudio, catalogColors, blank.colors, pickedColorName, previewColor, colors, previewSize])

  useEffect(() => {
    setCatalogColumnWidth(
      readStoredNumber(CATALOG_COLUMN_WIDTH_KEY, CATALOG_COLUMN_DEFAULT, CATALOG_COLUMN_MIN, CATALOG_COLUMN_MAX)
    )
    setCatalogPanelCollapsed(readCatalogPanelCollapsed())
    setDesignPanelCollapsed(readDesignPanelCollapsed())
  }, [])

  const setDesignPanelCollapsedPersist = useCallback((next: boolean) => {
    setDesignPanelCollapsed(next)
    window.localStorage.setItem(DESIGN_PANEL_COLLAPSED_KEY, next ? '1' : '0')
  }, [])

  const expandDesignPanel = useCallback(() => setDesignPanelCollapsedPersist(false), [setDesignPanelCollapsedPersist])

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1280px)')
    const apply = () => setStudioGridXl(mq.matches)
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])

  useEffect(() => {
    if (!catalogColumnResizing) return
    const onMove = (event: PointerEvent) => {
      const snap = catalogColumnResizeRef.current
      if (!snap) return
      const next = Math.min(
        CATALOG_COLUMN_MAX,
        Math.max(CATALOG_COLUMN_MIN, snap.startWidth + (event.clientX - snap.startX))
      )
      setCatalogColumnWidth(next)
    }
    const onUp = () => {
      catalogColumnResizeRef.current = null
      setCatalogColumnResizing(false)
      setCatalogColumnWidth((width) => {
        window.localStorage.setItem(CATALOG_COLUMN_WIDTH_KEY, String(width))
        return width
      })
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }, [catalogColumnResizing])

  useEffect(() => {
    if (!catalogColumnResizing) return
    const prevCursor = document.body.style.cursor
    const prevSelect = document.body.style.userSelect
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    return () => {
      document.body.style.cursor = prevCursor
      document.body.style.userSelect = prevSelect
    }
  }, [catalogColumnResizing])

  const onCatalogColumnResizeStart = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    catalogColumnResizeRef.current = { startX: event.clientX, startWidth: catalogColumnWidth }
    setCatalogColumnResizing(true)
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const resetCatalogColumnWidth = () => {
    setCatalogColumnWidth(CATALOG_COLUMN_DEFAULT)
    window.localStorage.setItem(CATALOG_COLUMN_WIDTH_KEY, String(CATALOG_COLUMN_DEFAULT))
  }

  const restoreStudioSnapshot = useCallback((snapshot: StudioSnapshot) => {
    setLayers(cloneLayers(snapshot.layers))
    setCatalogFileLayers(cloneStudioSnapshot(snapshot).catalogFileLayers)
  }, [])

  const pushStudioUndoSnapshot = useCallback((snapshot: StudioSnapshot) => {
    undoRef.current.push(cloneStudioSnapshot(snapshot))
    if (undoRef.current.length > 40) undoRef.current.shift()
    redoRef.current = []
    setHistoryTick((tick) => tick + 1)
  }, [])

  const pushStudioUndo = useCallback(() => {
    pushStudioUndoSnapshot(
      studioSnapshotFrom(layersRef.current, catalogFileLayersRef.current)
    )
  }, [pushStudioUndoSnapshot])

  const placeArt = useCallback(
    async (url: string, target?: PlacementId | string) => {
      const fileByType =
        typeof target === 'string'
          ? techniquePrintFiles.find((item) => item.type === target)
          : undefined
      const targetPlacement =
        fileByType && catalogStudio
          ? placementForPrintFile(fileByType, blank)
          : catalogArea ||
            garmentPlacements.find((item) => item.id === (target ?? placementId)) ||
            garmentPlacements[0]
      try {
        const image = await loadImage(url)
        const created: ArtPlacement = {
          placement: targetPlacement.id,
          assetUrl: url,
          assetWidth: image.naturalWidth || 1000,
          assetHeight: image.naturalHeight || 1000,
          ...fitPlacement(
            image.naturalWidth || 1000,
            image.naturalHeight || 1000,
            targetPlacement
          ),
        }
        pushStudioUndoSnapshot(
          studioSnapshotFrom(layersRef.current, catalogFileLayersRef.current)
        )
        if (catalogStudio && (fileByType || activePrintFile)) {
          const fileType = fileByType?.type || activePrintFile!.type
          setActivePrintFileType(fileType)
          setCatalogFileLayers((current) => ({ ...current, [fileType]: created }))
        } else {
          setLayers((current) => ({ ...current, [targetPlacement.id]: created }))
        }
        setPlacementId(targetPlacement.id)
        setPhotoPick(null)
        setStandIn(true)
        setNote(null)
      } catch (error: any) {
        setNote(error.message || 'Could not place that art')
      }
    },
    [
      activePrintFile,
      blank,
      catalogArea,
      catalogStudio,
      garmentPlacements,
      placementId,
      pushStudioUndoSnapshot,
      techniquePrintFiles,
    ]
  )

  const clearSnapGuidesSoon = useCallback((delayMs = 0) => {
    if (snapGuideTimer.current) window.clearTimeout(snapGuideTimer.current)
    if (delayMs <= 0) {
      setSnapGuides({ vertical: [], horizontal: [] })
      return
    }
    snapGuideTimer.current = window.setTimeout(() => {
      setSnapGuides({ vertical: [], horizontal: [] })
      snapGuideTimer.current = null
    }, delayMs)
  }, [])

  const updateLayer = (patch: Partial<ArtPlacement>) => {
    if (catalogStudio && activePrintFile) {
      setCatalogFileLayers((current) => {
        const existing = current[activePrintFile.type]
        if (!existing) return current
        return { ...current, [activePrintFile.type]: containPlacement({ ...existing, ...patch }, area) }
      })
      return
    }
    setLayers((current) => {
      const existing = current[area.id]
      if (!existing) return current
      return { ...current, [area.id]: containPlacement({ ...existing, ...patch }, area) }
    })
  }

  const moveLayerTo = useCallback(
    (rawX: number, rawY: number, options?: { guideHoldMs?: number }) => {
      if (!layer) return
      const snapped = snapArtInPrintArea(layer, area, { x: rawX, y: rawY })
      updateLayer({ x: snapped.x, y: snapped.y })
      const hasGuides = snapped.guides.vertical.length > 0 || snapped.guides.horizontal.length > 0
      if (hasGuides) {
        setSnapGuides(snapped.guides)
        if (options?.guideHoldMs != null) clearSnapGuidesSoon(options.guideHoldMs)
      } else {
        setSnapGuides({ vertical: [], horizontal: [] })
      }
    },
    [layer, area, clearSnapGuidesSoon]
  )

  const undoLayers = () => {
    const previous = undoRef.current.pop()
    if (!previous) return
    redoRef.current.push(studioSnapshotFrom(layersRef.current, catalogFileLayersRef.current))
    restoreStudioSnapshot(previous)
    setHistoryTick((tick) => tick + 1)
  }

  const redoLayers = () => {
    const next = redoRef.current.pop()
    if (!next) return
    undoRef.current.push(studioSnapshotFrom(layersRef.current, catalogFileLayersRef.current))
    restoreStudioSnapshot(next)
    setHistoryTick((tick) => tick + 1)
  }

  const onPointerDown = (event: React.PointerEvent) => {
    if (event.button !== 0 || !layer) return
    dragSnapshotRef.current = studioSnapshotFrom(layersRef.current, catalogFileLayersRef.current)
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = { x: layer.x, y: layer.y, clientX: event.clientX, clientY: event.clientY }
    setDragging(true)
  }

  const endArtMove = useCallback(() => {
    if (!dragRef.current && !dragSnapshotRef.current) return
    if (dragSnapshotRef.current) pushStudioUndoSnapshot(dragSnapshotRef.current)
    dragSnapshotRef.current = null
    dragRef.current = null
    setDragging(false)
    clearSnapGuidesSoon(420)
  }, [clearSnapGuidesSoon, pushStudioUndoSnapshot])

  const onPointerMove = (event: React.PointerEvent) => {
    if ((event.buttons & 1) === 0) {
      endArtMove()
      return
    }
    const drag = dragRef.current
    const rect = areaRef.current?.getBoundingClientRect()
    if (!drag || !rect || !layer) return
    const dx = (event.clientX - drag.clientX) / rect.width
    const dy = (event.clientY - drag.clientY) / rect.height
    moveLayerTo(drag.x + dx, drag.y + dy)
  }

  const onPointerUp = () => {
    endArtMove()
  }

  useEffect(() => {
    if (!dragging) return
    const onWindowEnd = () => endArtMove()
    window.addEventListener('pointerup', onWindowEnd)
    window.addEventListener('pointercancel', onWindowEnd)
    return () => {
      window.removeEventListener('pointerup', onWindowEnd)
      window.removeEventListener('pointercancel', onWindowEnd)
    }
  }, [dragging, endArtMove])

  const onArtAdjustStart = () => {
    dragSnapshotRef.current = studioSnapshotFrom(layersRef.current, catalogFileLayersRef.current)
  }

  const onArtAdjustEnd = () => {
    if (dragSnapshotRef.current) pushStudioUndoSnapshot(dragSnapshotRef.current)
    dragSnapshotRef.current = null
    flashGuide()
  }

  const onArtAdjust = (patch: Partial<ArtPlacement>) => {
    updateLayer(patch)
  }

  const finishSliderEdit = () => {
    if (sliderSnapshotRef.current) {
      pushStudioUndoSnapshot(sliderSnapshotRef.current)
      sliderSnapshotRef.current = null
    }
  }

  const flashGuide = () => {
    setGuideFlash(true)
    if (guideTimer.current) window.clearTimeout(guideTimer.current)
    guideTimer.current = window.setTimeout(() => setGuideFlash(false), 640)
  }

  const onWheel = (event: React.WheelEvent) => {
    if (!layer) return
    event.preventDefault()
    const delta = event.deltaY < 0 ? 0.03 : -0.03
    const cap = maxScaleInMitigation(layer, area)
    updateLayer({ scale: Math.min(cap, Math.max(0.15, layer.scale + delta)) })
    flashGuide()
  }

  const fit = () => {
    if (!layer) return
    pushStudioUndo()
    updateLayer(fitPlacement(layer.assetWidth, layer.assetHeight, area))
  }
  const resetScale = () => {
    if (!layer) return
    const fitted = fitPlacement(layer.assetWidth, layer.assetHeight, area)
    if (Math.abs(fitted.scale - layer.scale) < 0.0005) return
    pushStudioUndo()
    updateLayer({ scale: fitted.scale })
  }
  const applyRotation = (degrees: number) => {
    const snapped = snapRotation(degrees, rotateHoldRef.current)
    rotateHoldRef.current = snapped.held
    updateLayer({ rotation: snapped.rotation })
    flashGuide()
  }
  const beginRotationGuide = () => {
    rotateHoldRef.current = null
    setShowRotationGuides(true)
  }
  const endRotationGuide = () => {
    rotateHoldRef.current = null
    setShowRotationGuides(false)
  }
  const center = () => {
    if (!layer) return
    pushStudioUndo()
    const height =
      area.printWidth > 0 && layer.assetWidth > 0
        ? (layer.scale * area.printWidth * (layer.assetHeight / layer.assetWidth)) / area.printHeight
        : layer.scale
    updateLayer({ x: (1 - layer.scale) / 2, y: (1 - height) / 2 })
  }
  const optimizeForPrint = () => {
    if (!layer) return
    const next = optimizePlacementForPrint(layer, area)
    const unchanged =
      Math.abs(next.scale - layer.scale) < 0.0005 &&
      Math.abs(next.x - layer.x) < 0.0005 &&
      Math.abs(next.y - layer.y) < 0.0005 &&
      next.rotation === layer.rotation
    const embroidery = isEmbroideryFileType(area.printfulType)
    const edge = embroidery ? 'stitch area' : 'print area'
    if (unchanged) {
      setNote(`Already inside the ${edge}. Nothing is clipped.`)
      return
    }
    pushStudioUndo()
    updateLayer(next)
    const heldToPixels = next.scale + 0.01 < maxScaleInMitigation(layer, area) && next.scale <= nativePrintScale(layer.assetWidth, area) + 0.0005
    setNote(
      heldToPixels
        ? `Sized inside the ${edge} at this file’s own pixels, so it is not clipped or stretched.`
        : `Sized to the ${edge} so the edges are not clipped.`,
    )
    flashGuide()
  }

  const flipPlacement = () => {
    const other = garmentPlacements.find((item) => item.id !== area.id)
    if (!other) return
    setPlacementId(other.id)
    setPhotoPick(null)
  }

  const spinGarment = () => {
    if (isSpinning || garmentPlacements.length < 2) return
    setIsSpinning(true)
    setCardRotate(180)
  }

  const onGarmentSpinEnd = () => {
    if (cardRotate !== 180) return
    const other = garmentPlacements.find((item) => item.id !== placementId)
    if (other) setPlacementId(other.id)
    setPhotoPick(null)
    setSpinTransition(false)
    setCardRotate(0)
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setSpinTransition(true))
    })
    setIsSpinning(false)
  }

  const copyArtToBack = () => {
    if (catalogStudio && designTabs.length > 0) {
      const frontTab = designTabs.find((tab) => tab.label === 'Front')
      const backTab = designTabs.find((tab) => tab.label === 'Back')
      const source = frontTab ? catalogFileLayers[frontTab.id] : undefined
      if (!frontTab || !backTab || !source) return
      pushStudioUndo()
      const backArea = placementForPrintFile(
        techniquePrintFiles.find((file) => file.type === backTab.id)!,
        blank
      )
      setCatalogFileLayers((current) => ({
        ...current,
        [backTab.id]: containPlacement({ ...source, placement: backArea.id, fileType: backTab.id }, backArea),
      }))
      setNote('Front art copied to back placement.')
      return
    }
    const front = layers.front
    if (!front || !garmentPlacements.some((item) => item.id === 'back')) return
    pushStudioUndo()
    const backArea = garmentPlacements.find((item) => item.id === 'back')
    setLayers((current) => ({
      ...current,
      back: backArea
        ? containPlacement({ ...front, placement: 'back' }, backArea)
        : { ...front, placement: 'back' },
    }))
    setNote('Front art copied to back placement.')
  }

  const copyActiveToOther = () => {
    if (catalogStudio && activePrintFile && designTabs.length > 0) {
      const view = placementViewName(activePrintFile.type, activePrintFile.title || activePrintFile.type)
      const otherView: PlacementView | null =
        view === 'Front' ? 'Back' : view === 'Back' ? 'Front' : null
      if (!otherView) return
      const otherTab = designTabs.find((tab) => tab.label === otherView)
      const source = catalogFileLayers[activePrintFile.type]
      if (!otherTab || !source) return
      const otherFile = techniquePrintFiles.find((file) => file.type === otherTab.id)
      if (!otherFile) return
      pushStudioUndo()
      const otherArea = placementForPrintFile(otherFile, blank)
      setCatalogFileLayers((current) => ({
        ...current,
        [otherTab.id]: containPlacement({ ...source, placement: otherArea.id, fileType: otherTab.id }, otherArea),
      }))
      setNote(`Copied to the ${otherView.toLowerCase()}.`)
      return
    }
    const source = layers[area.id]
    const other = garmentPlacements.find((item) => item.id !== area.id)
    if (!source || !other) return
    pushStudioUndo()
    setLayers((current) => ({
      ...current,
      [other.id]: containPlacement({ ...source, placement: other.id }, other),
    }))
    setNote(`Copied to the ${other.label.toLowerCase()}.`)
  }

  const rotateActive = (delta: number) => {
    if (!layer) return
    pushStudioUndo()
    let rotation = layer.rotation + delta
    while (rotation > 180) rotation -= 360
    while (rotation < -180) rotation += 360
    updateLayer({ rotation })
    flashGuide()
  }

  const straightenActive = () => {
    if (!layer || layer.rotation === 0) return
    pushStudioUndo()
    updateLayer({ rotation: 0 })
    flashGuide()
  }

  const clearActiveLayer = () => {
    if (!layer) return
    pushStudioUndo()
    if (catalogStudio && activePrintFile) {
      setCatalogFileLayers((current) => {
        const next = { ...current }
        delete next[activePrintFile.type]
        return next
      })
      return
    }
    setLayers((current) => {
      const next = { ...current }
      delete next[area.id]
      return next
    })
  }

  const selectPlacementTab = useCallback(
    (id: string) => {
      const file = techniquePrintFiles.find((item) => item.type === id)
      if (file) {
        setActivePrintFileType(id)
        const nextArea = placementForPrintFile(file, blank)
        setPlacementId(nextArea.id)
        setPhotoPick(null)
        if (designId) writeOpenTab(designId, id)
        return
      }
      if (id === 'front' || id === 'back') {
        setPlacementId(id)
        setPhotoPick(null)
      }
    },
    [blank, designId, techniquePrintFiles]
  )

  const selectPlacementView = useCallback(
    (view: PlacementView) => {
      const tab = designTabs.find((item) => item.label === view)
      if (tab) {
        selectPlacementTab(tab.id)
        return
      }
      if (view === 'Front') selectPlacementTab('front')
      else if (view === 'Back') selectPlacementTab('back')
    },
    [designTabs, selectPlacementTab]
  )

  const activeDesignTabId = useMemo(() => {
    if (activePrintFile && designTabs.length > 0) {
      const byType = designTabs.find((tab) => tab.id === activePrintFile.type)
      if (byType) return byType.id
      const view = placementViewName(activePrintFile.type, activePrintFile.title || activePrintFile.type)
      const byLabel = view ? designTabs.find((tab) => tab.label === view) : undefined
      if (byLabel) return byLabel.id
    }
    const byPlacement = designTabs.find((tab) => tab.id === placementId)
    if (byPlacement) return byPlacement.id
    return activePrintFile?.type || placementId
  }, [activePrintFile, designTabs, placementId])

  const pickCatalogTechnique = (key: string) => {
    setCatalogTechnique(key)
    if (!catalogStudio) return
    const files = filterPrintFilesForTechnique(catalogStudio.printFiles, key)
    const first = files.find((file) => catalogFileLayers[file.type]?.assetUrl) || files[0]
    if (first) {
      selectPlacementTab(first.type)
    } else {
      setActivePrintFileType('')
    }
  }

  const openArt = (url: string) => {
    setViewingArt(url)
  }

  useEffect(() => {
    if (!viewingArt) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setViewingArt(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [viewingArt])

  const copyArtLink = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url)
      setNote('Artwork link copied.')
    } catch {
      setNote('Could not copy that link.')
    }
  }

  const downloadArt = async (url: string, filename: string) => {
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error('Could not download')
      const blob = await res.blob()
      const objectUrl = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = objectUrl
      anchor.download = filename
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      URL.revokeObjectURL(objectUrl)
    } catch {
      openArt(url)
    }
  }

  const uploadUsedBySaved = (upload: ArtUpload) =>
    saved.find((design) =>
      design.placements.some((placement) => merchArtIdFromUrl(placement.assetUrl)?.toLowerCase() === upload.id.toLowerCase())
    )?.name || null

  const removeUpload = async (upload: ArtUpload) => {
    if (!window.confirm('Remove this artwork from the library?')) return
    const res = await fetch(`/api/admin/merch/art?id=${encodeURIComponent(upload.id)}`, { method: 'DELETE' })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      if (res.status === 401) {
        setNote('Your session expired. Sign in again to remove artwork.')
        window.location.assign('/admin/login')
        return
      }
      setNote(data.error || 'Could not remove that artwork')
      return
    }
    const usedOnGarment =
      Object.values(layersRef.current).some((item) => item?.assetUrl && sameMerchArt(item.assetUrl, upload.url)) ||
      Object.values(catalogFileLayersRef.current).some((item) => item?.assetUrl && sameMerchArt(item.assetUrl, upload.url))
    if (usedOnGarment) {
      pushStudioUndo()
      setLayers((current) => {
        const next = { ...current }
        for (const key of Object.keys(next) as PlacementId[]) {
          const art = next[key]
          if (art?.assetUrl && sameMerchArt(art.assetUrl, upload.url)) delete next[key]
        }
        return next
      })
      setCatalogFileLayers((current) => {
        const next = { ...current }
        for (const key of Object.keys(next)) {
          const art = next[key]
          if (art?.assetUrl && sameMerchArt(art.assetUrl, upload.url)) delete next[key]
        }
        return next
      })
    }
    setUploads((current) => current.filter((item) => item.id !== upload.id))
    setNote('Removed from the art library.')
  }

  const markCleanRef = useRef<() => void>(() => {})

  const applyCatalogProduct = async (
    product: PrintfulCatalogProduct,
    options?: { baseline?: boolean; fresh?: boolean },
  ) => {
    const template = resolveBlankForCatalogProduct(product)
    const keepPrice = !options?.fresh && priceTouched
    if (options?.fresh || template.id !== blank.id) {
      setBlankId(template.id)
      setDesignId(null)
      setStatus('draft')
      setMockupUrls([])
      setMockupUrlsByColor({})
      setMockupAngleTitlesByColor({})
      setMockupColor(null)
      setMockupColorName(null)
      printFileUrlsRef.current = {}
      setPrintFileUrls({})
      setCostLive(false)
      setPriceTouched(false)
      setName(product.title.slice(0, 80))
      if (!keepPrice) setPrice(suggestRetail(template.estimatedCost))
    }
    setCatalogProductId(product.id)
    setCatalogFileLayers({})
    setEmbroideryUnlimitedColor(false)
    setEmbroideryThreads({})
    setStandIn(true)
    setPhotoPick(null)
    setStageZoom(1)
    setMockupUrls([])
    setMockupUrlsByColor({})
    setMockupAngleTitlesByColor({})
    setMockupColor(null)
    setMockupColorName(null)
    printFileUrlsRef.current = {}
    setPrintFileUrls({})
    if (!name.trim()) setName(product.title.slice(0, 80))
    try {
      const res = await fetch(`/api/admin/merch/catalog/${product.id}`)
      const detail = (await res.json()) as CatalogProductDetail & { error?: string }
      if (!res.ok) throw new Error(detail.error || 'Could not load Printful product')
      setCatalogStudio(detail)
      const nextTechnique =
        detail.techniques?.find((row) => row.isDefault)?.key || detail.techniques?.[0]?.key || 'DTG'
      setCatalogTechnique(nextTechnique)
      const firstFiles = filterPrintFilesForTechnique(detail.printFiles, nextTechnique)
      const firstFile = openingPrintFile(firstFiles, detail.designIntel?.angles) || firstFiles[0]
      if (firstFile) {
        setActivePrintFileType(firstFile.type)
        setPlacementId(placementForPrintFile(firstFile, template).id)
      } else {
        setActivePrintFileType('')
      }
      const nextPreviewSize = detail.defaultSizes?.[0] || detail.sizes?.[0] || 'M'
      setPreviewSize(nextPreviewSize)
      if (Array.isArray(detail.colors) && detail.colors.length > 0) {
        setCatalogColors(detail.colors)
        setColors(
          detail.defaultColors?.length
            ? detail.defaultColors
            : detail.colors.slice(0, 2).map((c) => c.name)
        )
        const firstHex = detail.colors[0]?.hex
        if (firstHex) setPreviewColor(firstHex)
        setPickedColorName(detail.colors[0]?.name || null)
      }
      if (Array.isArray(detail.sizes) && detail.sizes.length > 0) {
        setCatalogSizes(detail.sizes)
        setSizes(detail.defaultSizes?.length ? detail.defaultSizes : detail.sizes.slice(0, 5))
      }
      if (detail.minWholesale && Number.isFinite(detail.minWholesale)) {
        setWholesale(detail.minWholesale)
        if (!keepPrice) setPrice(suggestRetail(detail.minWholesale))
      }
      if (!firstFile) {
        setPlacementId(studioPlacementsForTechnique(detail, template, nextTechnique)[0]?.id || 'front')
      }
      setNote(null)
      if (options?.baseline !== false) markCleanRef.current()
    } catch (error: unknown) {
      setNote(error instanceof Error ? error.message : 'Could not load Printful product')
    }
  }

  const openSavedDesign = async (design: MerchDesign) => {
    setPriceTouched(true)
    const template = getBlank(design.blankId) || MERCH_BLANKS[0]
    if (design.catalogProductId) {
      try {
        const res = await fetch(`/api/admin/merch/catalog/${design.catalogProductId}`)
        const detail = (await res.json()) as CatalogProductDetail & { error?: string }
        if (res.ok && detail.product) {
          await applyCatalogProduct(detail.product, { baseline: false })
          const hero = previewArtPlacement(design.placements, design.activeFileType)
          const technique =
            techniqueForSavedFile(detail.techniques || [], hero?.fileType || design.activeFileType) ||
            detail.techniques?.find((row) => row.isDefault)?.key ||
            detail.techniques?.[0]?.key ||
            'DTG'
          setCatalogTechnique(technique)
          const files = filterPrintFilesForTechnique(detail.printFiles, technique)
          const mapped = restoreCatalogFileLayers(design.placements, detail.printFiles, template)
          if (Object.keys(mapped).length > 0) setCatalogFileLayers(mapped)
          const preferTypes = Object.entries(mapped)
            .filter(([, art]) => Boolean(art?.assetUrl))
            .map(([type]) => type)
          const tabs = buildDesignTabs(files, studioPlacementsForTechnique(detail, template, technique), {
            preferTypes,
          })
          const nextType = placementFileToOpen(tabs, mapped, hero?.fileType || design.activeFileType)
          const nextFile = nextType ? files.find((file) => file.type === nextType) : null
          if (nextFile) {
            setActivePrintFileType(nextFile.type)
            setPlacementId(placementForPrintFile(nextFile, template).id)
            writeOpenTab(design.id, nextFile.type)
          }
        }
      } catch {
        setNote('Could not open that design')
      }
    } else {
      setBlankId(template.id)
      setCatalogProductId(template.catalogHintId)
      setCatalogStudio(null)
    }
    const nextLayers: LayersState = {}
    for (const placement of design.placements) {
      // Studio blanks only know front/back; the first art for each side wins.
      if (!nextLayers[placement.placement]) nextLayers[placement.placement] = placement
    }
    setLayers(nextLayers)
    setDesignId(design.id)
    setName(design.name)
    setPrice(design.retailPrice)
    setStatus(design.status)
    setColors(design.colors.length ? design.colors : template.defaultColors)
    setSizes(design.sizes.length ? design.sizes : template.defaultSizes)
    setPreviewColor(design.previewColor || template.colors[0]?.hex || '#1a1a1a')
    setEmbroideryUnlimitedColor(Boolean(design.embroideryUnlimitedColor))
    setEmbroideryThreads(design.embroideryThreads || {})
    setPickedColorName(null)
    setMockupUrls(design.mockupUrls || [])
    setMockupUrlsByColor(design.mockupUrlsByColor || {})
    setMockupAngleTitlesByColor(design.mockupAngleTitlesByColor || {})
    setMockupColor(design.mockupUrls.length > 0 ? design.previewColor || null : null)
    setMockupColorName(design.mockupUrls.length > 0 ? design.previewColorName || null : null)
    printFileUrlsRef.current = design.printFileUrls || {}
    setPrintFileUrls(design.printFileUrls || {})
    setStandIn(design.mockupUrls.length === 0 && !Object.values(design.mockupUrlsByColor || {}).some((urls) => urls.length > 0))
    setStageZoom(1)
    onStageViewChange('preview')
    setNote(null)
    publishRun.current += 1
    if (design.mockupTaskKey) void pollMockups(design.id, publishRun.current)
    setPublishProgress(null)
    writeStudioDesignId(design.id)
    markCleanRef.current()
  }

  const bootedStudio = useRef(false)

  const toggleDockTool = (tool: StudioDockTool) => {
    if (tool === 'guide') {
      setGuidePinned((pinned) => {
        const next = !pinned
        setDockTool(next ? 'guide' : null)
        return next
      })
      return
    }
    setDockTool((current) => (current === tool ? null : tool))
  }

  const pickPreviewColor = (hex: string, colorName: string) => {
    const alreadyPreview = colorName === previewColorName
    setPreviewColor(hex)
    setPickedColorName(colorName)
    setPhotoPick(null)
    setColors((current) => {
      if (!current.includes(colorName)) return [...current, colorName]
      if (alreadyPreview && current.length > 1) return current.filter((item) => item !== colorName)
      return current
    })
  }

  useEffect(() => {
    setProductMats(readProductMats())
  }, [])

  useEffect(() => {
    if (!stageToneMenu) return
    const close = (event: PointerEvent) => {
      const node = event.target
      if (node instanceof Element && node.closest('[aria-label="Stage background"]')) return
      setStageToneMenu(null)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setStageToneMenu(null)
    }
    window.addEventListener('pointerdown', close)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', close)
      window.removeEventListener('keydown', onKey)
    }
  }, [stageToneMenu])

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (artMenu) return
      const target = event.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return
      }
      if ((event.metaKey || event.ctrlKey) && event.key === 'z') {
        event.preventDefault()
        if (event.shiftKey) redoLayers()
        else undoLayers()
      } else if (layer && (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
        event.preventDefault()
        pushStudioUndo()
        const step = event.shiftKey ? 0.05 : 0.01
        const dx = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0
        const dy = event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0
        moveLayerTo(layer.x + dx, layer.y + dy, { guideHoldMs: 480 })
        flashGuide()
      } else if (event.key === 'f' || event.key === 'F') {
        event.preventDefault()
        fit()
      } else if (event.key === 'c' || event.key === 'C') {
        event.preventDefault()
        center()
      } else if (event.key === '1') {
        event.preventDefault()
        selectPlacementView('Front')
      } else if (event.key === '2') {
        event.preventDefault()
        selectPlacementView('Back')
      } else if (event.key === '3') {
        event.preventDefault()
        selectPlacementView('Right sleeve')
      } else if (event.key === '4') {
        event.preventDefault()
        selectPlacementView('Left sleeve')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const outside = layer ? artOutside(layer, area) : false
  const showGuide = guidePinned || (Boolean(layer) && (dragging || guideFlash || outside))
  const canUndo = undoRef.current.length > 0
  const canRedo = redoRef.current.length > 0
  void historyTick
  const stageToolbar: DesignStageToolbarProps = {
    canUndo,
    canRedo,
    onUndo: undoLayers,
    onRedo: redoLayers,
    busy,
    onSaveDesign: () => void saveDraft(),
    onSaveHidden: () => void saveHidden(),
  }
  const stitch = stitchInsets(area)
  const safePx = 0.25 * (area.dpi && area.dpi > 0 ? area.dpi : 150)
  const insetX = stitch.x || (area.printWidth > 0 ? safePx / area.printWidth : 0)
  const insetY = stitch.y || (area.printHeight > 0 ? safePx / area.printHeight : 0)
  const swatchColors = catalogColors && catalogColors.length > 0 ? catalogColors : blank.colors
  const previewColorName =
    (pickedColorName && swatchColors.some((color) => color.name === pickedColorName) && pickedColorName) ||
    swatchColors.find((color) => color.hex.toLowerCase() === previewColor.toLowerCase())?.name ||
    colors[0] ||
    ''
  const activeThreadOptionId = threadOptionIdForFile(
    activePrintFile?.type || '',
    catalogStudio?.threadOptionIds || [],
  )
  const selectedEmbroideryThreads =
    (activeThreadOptionId && embroideryThreads[activeThreadOptionId]?.length
      ? embroideryThreads[activeThreadOptionId]
      : [matchingEmbroideryThread(previewColor, previewColorName).hex])
  const pickEmbroideryThread = (hex: string) => {
    if (!activeThreadOptionId) return
    if (layer?.assetUrl) {
      manualThreadKey.current = `${activeThreadOptionId}|${layer.assetUrl.split(/[?#]/)[0]}`
    }
    setEmbroideryThreadNote('Tap a color to add or remove it. Up to 6.')
    setEmbroideryThreads((current) => {
      const existing = current[activeThreadOptionId]?.length
        ? current[activeThreadOptionId]
        : [matchingEmbroideryThread(previewColor, previewColorName).hex]
      return { ...current, [activeThreadOptionId]: toggleEmbroideryThread(existing, hex) }
    })
  }
  const catalogGarmentUrl = useMemo(
    () => (catalogStudio ? previewGarmentImage(catalogStudio, previewColorName, previewSize) : null),
    [catalogStudio, previewColorName, previewSize]
  )
  const designGarment = useMemo(() => {
    if (!catalogStudio) return null
    return (
      coloredTemplate(catalogStudio, activePrintFile, previewColorName, previewSize) || {
        imageUrl: designGarmentImage(catalogStudio, activePrintFile, previewColorName, previewSize) || '',
        backgroundColor: null,
      }
    )
  }, [catalogStudio, activePrintFile, previewColorName, previewSize])
  const designGarmentUrl = designGarment?.imageUrl || null
  const designPatternUrl = positioningPatternUrl(
    catalogStudio,
    designGarmentUrl,
    previewColorName,
    previewSize,
  )
  const designUsesTemplateMockup = hasTemplateStage(activePrintFile)
  /** Preview card keeps the template image's real shape; studio blanks stay 3:4. */
  const previewCardAspect =
    designUsesTemplateMockup && activePrintFile?.templateAspect && activePrintFile.templateAspect > 0
      ? activePrintFile.templateAspect
      : designUsesTemplateMockup
        ? 1
        : 3 / 4
  const sizeOptions = catalogSizes && catalogSizes.length > 0 ? catalogSizes : blank.sizes

  const catalogAddOnRows = useMemo(
    () =>
      catalogStudio
        ? usedCatalogAddOnRows(techniquePrintFiles, catalogFileLayers, embroideryUnlimitedColor)
        : [],
    [catalogStudio, techniquePrintFiles, catalogFileLayers, embroideryUnlimitedColor],
  )
  const catalogExtras = useMemo(() => sumCatalogAddOnRows(catalogAddOnRows), [catalogAddOnRows])

  const effectiveWholesale = wholesale + catalogExtras
  const keep = useMemo(() => youKeep(price, effectiveWholesale), [price, effectiveWholesale])
  const showStoredPhoto =
    mockupUrls.length > 0 &&
    !standIn &&
    (mockupColorName
      ? sameColorKey(previewColorName, mockupColorName)
      : !mockupColor || sameColorKey(previewColor, mockupColor))
  const anglePhotos = (() => {
    const named = Object.entries(mockupUrlsByColor).find(([name]) => sameColorKey(name, previewColorName))
    const fromColor = (named?.[1] || []).filter(Boolean)
    if (fromColor.length > 0) return fromColor
    return showStoredPhoto ? mockupUrls : []
  })()
  const photoAt = Math.min(
    photoPick ?? Math.max(0, garmentPlacements.findIndex((item) => item.id === area.id)),
    Math.max(anglePhotos.length - 1, 0),
  )
  const activePhoto = anglePhotos[photoAt]
  useEffect(() => {
    if (!mockupUrls.length || mockupColorName || pickedColorName) return
    if (!previewColorName) return
    setMockupColorName(previewColorName)
  }, [mockupUrls.length, mockupColorName, pickedColorName, previewColorName])
  const colorShots = useMemo(() => {
    if (!catalogStudio || standIn || mockupUrls.length === 0) return []
    const swatch = swatchColors.find((color) => color.name === previewColorName)
    const shots: Array<{
      id: string
      garmentUrl: string
      garmentColor: string
      patternUrl: string | null
      aspect: number
      label: string
      stage: { x: number; y: number; w: number; h: number }
      area: typeof area
      printUrl: string | null
      art: ArtPlacement | null
    }> = []
    const savedTitles =
      Object.entries(mockupAngleTitlesByColor).find(([name]) => sameColorKey(name, previewColorName))?.[1] ||
      Object.values(mockupAngleTitlesByColor).find((list) => list.length > 0) ||
      []
    const guideTitles =
      savedTitles.length > 0 ? savedTitles : catalogStudio.designIntel?.angles.map((angle) => angle.view) || []
    for (const file of orderPrintFilesByAngles(
      techniquePrintFiles.filter((row) => hasTemplateStage(row)),
      guideTitles,
    )) {
      const template = coloredTemplate(catalogStudio, file, previewColorName, previewSize)
      if (!template?.imageUrl) continue
      const printArea = placementForPrintFile(file, blank, { surface: 'template' })
      const patternUrl = positioningPatternUrl(catalogStudio, template.imageUrl, previewColorName, previewSize)
      shots.push({
        id: file.type,
        label: file.title || file.type,
        garmentUrl: template.imageUrl,
        garmentColor: patternUrl ? '' : template.backgroundColor || swatch?.hex || previewColor,
        patternUrl,
        aspect: file.templateAspect && file.templateAspect > 0 ? file.templateAspect : 1,
        stage: printArea.stage,
        area: printArea,
        printUrl: printFileUrls[file.type] || null,
        art: catalogFileLayers[file.type] || null,
      })
    }
    return shots
  }, [
    blank,
    catalogFileLayers,
    catalogStudio,
    mockupAngleTitlesByColor,
    mockupUrls.length,
    previewColor,
    previewColorName,
    previewSize,
    printFileUrls,
    standIn,
    swatchColors,
    techniquePrintFiles,
  ])
  const colorAt = Math.min(
    photoPick ?? Math.max(0, colorShots.findIndex((shot) => shot.id === (activePrintFile?.type || ''))),
    Math.max(colorShots.length - 1, 0),
  )
  const colorShot = !showStoredPhoto ? colorShots[colorAt] : undefined
  const activePlacements: ArtPlacement[] =
    catalogStudio && Object.keys(catalogFileLayers).length > 0
      ? Object.entries(catalogFileLayers)
          .map(([fileType, art]): ArtPlacement | null => {
            if (!art.assetUrl) return null
            const file = catalogStudio.printFiles.find((row) => row.type === fileType)
            if (!file) return null
            const printArea = placementForPrintFile(file, blank)
            return { ...art, placement: printArea.id, fileType: file.type }
          })
          .filter((item): item is ArtPlacement => item !== null)
      : garmentPlacements
          .map((item) => layers[item.id])
          .filter((item): item is ArtPlacement => Boolean(item?.assetUrl))
          .map(({ fileType: _ignored, ...art }): ArtPlacement => art)

  const studioSnapshot = JSON.stringify({
    designId,
    catalogProductId,
    name,
    price,
    colors,
    sizes,
    previewColor,
    embroideryUnlimitedColor,
    embroideryThreads,
    catalogTechnique,
    activeFileType: activePrintFileType,
    placements: activePlacements.map((placement) => [
      placement.fileType || placement.placement,
      placement.assetUrl,
      Math.round(placement.x * 1000) / 1000,
      Math.round(placement.y * 1000) / 1000,
      Math.round(placement.scale * 1000) / 1000,
      Math.round(placement.rotation * 1000) / 1000,
    ]),
  })
  const studioSnapshotRef = useRef(studioSnapshot)
  studioSnapshotRef.current = studioSnapshot
  markCleanRef.current = () => {
    setGuardOn(true)
    setBaselineTick((tick) => tick + 1)
  }
  useEffect(() => {
    if (!guardOn) return
    setCleanSnapshot(studioSnapshotRef.current)
  }, [baselineTick, guardOn])
  const designDirty = guardOn && cleanSnapshot !== null && studioSnapshot !== cleanSnapshot
  const embroideryUnlimitedRef = useRef(embroideryUnlimitedColor)
  embroideryUnlimitedRef.current = embroideryUnlimitedColor
  const embroideryOn =
    catalogTechnique.trim().toUpperCase() === 'EMBROIDERY' ||
    Boolean(activePrintFile && /embroidery/i.test(activePrintFile.type))

  useEffect(() => {
    if (!embroideryOn || !layer?.assetUrl || !activeThreadOptionId) return
    const url = layer.assetUrl
    const optionId = activeThreadOptionId
    const key = `${optionId}|${url.split(/[?#]/)[0]}`
    if (manualThreadKey.current === key) return
    const token = ++threadDetectToken.current
    void sampleArtworkThreadColors(url)
      .then((matched) => {
        if (token !== threadDetectToken.current || matched.threads.length === 0 || manualThreadKey.current === key) return
        setEmbroideryThreads((current) => ({ ...current, [optionId]: matched.threads }))
        setEmbroideryThreadNote(threadMatchNote(matched, embroideryUnlimitedRef.current))
      })
      .catch(() => {})
    return () => {
      if (threadDetectToken.current === token) threadDetectToken.current += 1
    }
  }, [embroideryOn, layer?.assetUrl, activeThreadOptionId])

  const chooseEmbroideryColorOption = (unlimited: boolean) => {
    setEmbroideryUnlimitedColor(unlimited)
    const url = layer?.assetUrl
    const optionId = activeThreadOptionId
    if (!url || !optionId) {
      setEmbroideryThreadNote(unlimited ? 'Unlimited color stitches every color in this design.' : null)
      return
    }
    manualThreadKey.current = null
    const token = ++threadDetectToken.current
    void sampleArtworkThreadColors(url)
      .then((matched) => {
        if (token !== threadDetectToken.current || matched.threads.length === 0) return
        setEmbroideryThreads((current) => ({ ...current, [optionId]: matched.threads }))
        setEmbroideryThreadNote(threadMatchNote(matched, unlimited))
      })
      .catch(() => {
        if (token !== threadDetectToken.current) return
        setEmbroideryThreadNote(unlimited ? 'Unlimited color stitches every color in this design.' : null)
      })
  }

  const openSavedDesignRef = useRef(openSavedDesign)
  openSavedDesignRef.current = openSavedDesign
  const applyCatalogProductRef = useRef(applyCatalogProduct)
  applyCatalogProductRef.current = applyCatalogProduct

  useEffect(() => {
    if (!savedReady || bootedStudio.current) return
    bootedStudio.current = true
    const lastId = readStudioDesignId()
    const last = saved.find((design) => design.id === lastId)
    const newestDraft = [...saved]
      .filter((design) => design.status === 'draft')
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]
    const pick = last || newestDraft
    if (pick) {
      void openSavedDesignRef.current(pick)
      return
    }
    if (!catalogProductId) {
      markCleanRef.current()
      return
    }
    void fetch(`/api/admin/merch/catalog/${catalogProductId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((detail: (CatalogProductDetail & { product?: PrintfulCatalogProduct }) | null) => {
        if (detail?.product) return applyCatalogProductRef.current(detail.product)
        markCleanRef.current()
      })
      .catch(() => markCleanRef.current())
  }, [savedReady, saved, catalogProductId])

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!designDirty) return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [designDirty])

  async function confirmLeave(detail: string, run: () => Promise<void>) {
    if (!designDirty) {
      await run()
      return
    }
    if (designId) {
      try {
        await persist(status)
        setNote('Saved. Opening the next project.')
        await run()
      } catch (error: unknown) {
        setNote(error instanceof Error ? error.message : 'Could not save before switching')
      }
      return
    }
    setLeavePrompt({ detail, run })
  }

  async function selectCatalogProduct(product: PrintfulCatalogProduct) {
    if (product.id === catalogProductId && (designId || !designDirty)) return
    await confirmLeave(
      `You’re starting ${product.title}. Save this design as a draft, discard it, or keep working.`,
      () => applyCatalogProduct(product, { fresh: true }),
    )
  }

  async function selectSavedDesign(design: MerchDesign) {
    if (design.id === designId) {
      onStageViewChange('preview')
      return
    }
    // Switching products discards unsaved canvas edits. Save draft is explicit.
    await openSavedDesign(design)
  }

  const placedDesignChecks = useMemo(() => {
    if (catalogStudio && techniquePrintFiles.length > 0) {
      return techniquePrintFiles
        .map((file) => {
          const art = catalogFileLayers[file.type]
          if (!art?.assetUrl) return null
          const printArea = placementForPrintFile(file, blank)
          return { label: placementTabLabel(file.title || file.type), art, area: printArea }
        })
        .filter((item): item is { label: string; art: ArtPlacement; area: BlankPlacement } => Boolean(item))
    }
    return garmentPlacements
      .map((item) => {
        const art = layers[item.id]
        if (!art?.assetUrl) return null
        return { label: item.label, art, area: item }
      })
      .filter((item): item is { label: string; art: ArtPlacement; area: BlankPlacement } => Boolean(item))
  }, [blank, catalogFileLayers, catalogStudio, garmentPlacements, layers, techniquePrintFiles])

  const designIssues = useMemo(() => designPlacementIssues(placedDesignChecks), [placedDesignChecks])
  const placementConflicts = useMemo(
    () =>
      conflictingPlacementProblems(
        activePlacements.map((item) => item.fileType).filter((type): type is string => Boolean(type)),
        catalogStudio?.designIntel?.conflicts || [],
      ),
    [activePlacements, catalogStudio?.designIntel?.conflicts],
  )
  const activeDpiGrade = layer ? dpiGrade(effectiveDpi(layer, area)) : null
  const canPutOutDesign =
    activePlacements.length > 0 && designIssues.outside.length === 0 && placementConflicts.length === 0

  const otherFace = garmentPlacements.find((item) => item.id !== area.id)
  const artMenuOpen = Boolean(artMenu && (artMenu.target === 'upload' || layer))
  const artMenuItems: StudioContextMenuEntry[] = !artMenu
    ? []
    : artMenu.target === 'stage' && layer
      ? [
          {
            type: 'command',
            command: { id: 'fit', label: 'Fit in print area', shortcut: 'F', onSelect: fit },
          },
          {
            type: 'command',
            command: { id: 'center', label: 'Center', shortcut: 'C', onSelect: center },
          },
          {
            type: 'command',
            command: { id: 'rotate-cw', label: 'Rotate 90° clockwise', onSelect: () => rotateActive(90) },
          },
          {
            type: 'command',
            command: {
              id: 'rotate-ccw',
              label: 'Rotate 90° counter-clockwise',
              onSelect: () => rotateActive(-90),
            },
          },
          {
            type: 'command',
            command: {
              id: 'straighten',
              label: 'Straighten',
              disabled: layer.rotation === 0,
              onSelect: straightenActive,
            },
          },
          {
            type: 'command',
            command: {
              id: 'remove-bg',
              label: 'Remove background',
              onSelect: () => void removeBackgroundArt(layer.assetUrl),
            },
          },
          { type: 'separator' },
          {
            type: 'command',
            command: { id: 'edit', label: 'Scale and rotate', onSelect: () => setDockTool('edit') },
          },
          {
            type: 'command',
            command: {
              id: 'guide',
              label: guidePinned ? 'Hide print guide' : 'Show print guide',
              onSelect: () => toggleDockTool('guide'),
            },
          },
          {
            type: 'command',
            command: {
              id: 'copy-side',
              label: otherFace ? `Copy to ${otherFace.label.toLowerCase()}` : 'Copy to other side',
              disabled: !otherFace,
              onSelect: copyActiveToOther,
            },
          },
          { type: 'separator' },
          {
            type: 'command',
            command: { id: 'open', label: 'Open artwork', onSelect: () => openArt(layer.assetUrl) },
          },
          {
            type: 'command',
            command: {
              id: 'edit-artwork',
              label: 'Edit artwork',
              onSelect: () => setEditingArt(layer.assetUrl),
            },
          },
          {
            type: 'command',
            command: { id: 'link', label: 'Copy link', onSelect: () => void copyArtLink(layer.assetUrl) },
          },
          {
            type: 'command',
            command: {
              id: 'download',
              label: 'Download',
              onSelect: () => void downloadArt(layer.assetUrl, artFileName(layer.assetUrl)),
            },
          },
          { type: 'separator' },
          {
            type: 'command',
            command: {
              id: 'clear',
              label: 'Remove from garment',
              danger: true,
              onSelect: clearActiveLayer,
            },
          },
        ]
      : artMenu.target === 'upload'
        ? [
            ...(catalogStudio && designTabs.length > 0
              ? designTabs.map((tab): StudioContextMenuEntry => {
                  const existing = catalogFileLayers[tab.id]
                  const same = Boolean(existing?.assetUrl && sameMerchArt(existing.assetUrl, artMenu.upload.url))
                  const areaLabel = tab.label.toLowerCase()
                  const label = same
                    ? `Refit on ${areaLabel}`
                    : existing
                      ? `Replace ${areaLabel}`
                      : `Place on ${areaLabel}`
                  return {
                    type: 'command',
                    command: {
                      id: `place-${tab.id}`,
                      label,
                      onSelect: () => void placeArt(artMenu.upload.url, tab.id),
                    },
                  }
                })
              : garmentPlacements.map((target): StudioContextMenuEntry => {
                  const existing = layers[target.id]
                  const same = Boolean(existing?.assetUrl && sameMerchArt(existing.assetUrl, artMenu.upload.url))
                  const label = same
                    ? `Refit on ${target.label.toLowerCase()}`
                    : existing
                      ? `Replace ${target.label.toLowerCase()}`
                      : `Place on ${target.label.toLowerCase()}`
                  return {
                    type: 'command',
                    command: {
                      id: `place-${target.id}`,
                      label,
                      onSelect: () => void placeArt(artMenu.upload.url, target.id),
                    },
                  }
                })),
            { type: 'separator' },
            {
              type: 'command',
              command: { id: 'open', label: 'Open artwork', onSelect: () => openArt(artMenu.upload.url) },
            },
            {
              type: 'command',
              command: {
                id: 'edit-artwork',
                label: 'Edit artwork',
                onSelect: () => setEditingArt(artMenu.upload.url),
              },
            },
            {
              type: 'command',
              command: {
                id: 'link',
                label: 'Copy link',
                onSelect: () => void copyArtLink(artMenu.upload.url),
              },
            },
            {
              type: 'command',
              command: {
                id: 'download',
                label: 'Download',
                onSelect: () => void downloadArt(artMenu.upload.url, artMenu.upload.id),
              },
            },
            {
              type: 'command',
              command: {
                id: 'remove-bg',
                label: 'Remove background',
                onSelect: () => void removeBackgroundArt(artMenu.upload.url),
              },
            },
            { type: 'separator' },
            {
              type: 'command',
              command: {
                id: 'remove-library',
                label: 'Remove from library',
                danger: true,
                disabled: Boolean(uploadUsedBySaved(artMenu.upload)),
                shortcut: uploadUsedBySaved(artMenu.upload) ? 'In use' : undefined,
                onSelect: () => void removeUpload(artMenu.upload),
              },
            },
          ]
        : []

  const artMenuTitle =
    artMenu?.target === 'stage' ? `${area.label} art` : artMenu?.target === 'upload' ? 'Library art' : 'Artwork'

  /**
   * Upload art straight to Supabase Storage via a signed URL. This avoids the
   * ~4.5MB serverless request-body limit on Vercel that otherwise fails larger
   * uploads on the live site. Returns the public URL, or null to fall back.
   */
  async function uploadViaSignedUrl(
    file: File,
    onProgress: (ratio: number) => void,
    origin?: 'print',
  ): Promise<string | null> {
    try {
      const signRes = await fetch('/api/admin/merch/art/sign-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contentType: file.type, ...(origin ? { origin } : {}) }),
      })
      if (!signRes.ok) return null
      const sign = await signRes.json()
      if (!sign?.publicUrl) return null

      // Cloudflare R2: presigned PUT straight to the bucket.
      if (sign.provider === 'r2' && sign.uploadUrl) {
        const put = await requestWithProgress(
          String(sign.uploadUrl),
          {
            method: 'PUT',
            headers: { 'Content-Type': String(sign.contentType || file.type) },
            body: file,
          },
          (loaded, total) => onProgress(total > 0 ? loaded / total : 0),
        )
        if (!put.ok) return null
        return withArtVersion(String(sign.publicUrl), Date.now())
      }

      // Supabase Storage: signed upload token.
      if (sign.path && sign.token) {
        const supabase = createSupabaseClient()
        const { error } = await supabase.storage
          .from('gallery-images')
          .uploadToSignedUrl(sign.path, sign.token, file, { contentType: file.type })
        if (error) return null
        return withArtVersion(String(sign.publicUrl), Date.now())
      }

      return null
    } catch {
      return null
    }
  }

  /**
   * Send a large file through the site in pieces. The browser cannot PUT
   * straight to R2 until the bucket allows uploads from this origin.
   */
  async function uploadViaChunks(
    file: File,
    onProgress: (ratio: number) => void,
    origin?: 'print',
  ): Promise<string> {
    const chunkSize = Math.floor(3.5 * 1024 * 1024)
    const total = Math.ceil(file.size / chunkSize)
    let uploadId = ''
    for (let index = 0; index < total; index += 1) {
      const start = index * chunkSize
      const body = new FormData()
      const slice = file.slice(start, Math.min(file.size, start + chunkSize))
      body.set('file', slice, file.name || 'art')
      body.set('index', String(index))
      body.set('total', String(total))
      body.set('contentType', file.type)
      if (origin) body.set('origin', origin)
      if (uploadId) body.set('uploadId', uploadId)
      const res = await requestWithProgress(
        '/api/admin/merch/art/chunk',
        { method: 'POST', body },
        (loaded) => onProgress(Math.min(1, (start + loaded) / file.size)),
      )
      let data: { error?: string; uploadId?: string; url?: string } = {}
      try {
        data = JSON.parse(res.text || '{}')
      } catch {
        data = {
          error:
            res.status === 413 || (res.text || '').startsWith('Request En')
              ? 'That file is too large to send in one piece.'
              : 'Upload failed',
        }
      }
      if (!res.ok) throw new Error(data.error || 'Upload failed')
      uploadId = String(data.uploadId || uploadId)
      onProgress(Math.min(1, (start + slice.size) / file.size))
      if (data.url) return withArtVersion(String(data.url), Date.now())
    }
    throw new Error('Upload did not finish')
  }

  /** One Vercel request stays under the platform body limit. Larger files go direct or in pieces. */
  const SINGLE_UPLOAD_BYTES = Math.floor(3.5 * 1024 * 1024)

  async function responseJson<T extends { error?: string }>(res: Response): Promise<T> {
    const text = await res.text()
    if (!text) return {} as T
    try {
      return JSON.parse(text) as T
    } catch {
      const tooLarge = res.status === 413 || text.startsWith('Request En')
      throw new Error(
        tooLarge ? 'That file is too large to send in one piece.' : text.replace(/\s+/g, ' ').slice(0, 160),
      )
    }
  }

  async function storePreparedArt(
    file: File,
    options: { replaceUrl?: string | null; origin?: 'print' } = {},
  ): Promise<string> {
    if (file.size > SINGLE_UPLOAD_BYTES) {
      if (!options.replaceUrl) {
        const direct = await uploadViaSignedUrl(file, () => {}, options.origin)
        if (direct) return direct
      }
      return uploadViaChunks(file, () => {}, options.origin)
    }
    const body = new FormData()
    body.set('file', file)
    if (options.replaceUrl) body.set('replaceUrl', options.replaceUrl)
    else if (options.origin) body.set('origin', options.origin)
    const res = await fetch('/api/admin/merch/art', { method: 'POST', body })
    const data = await responseJson<{ error?: string; url?: string }>(res)
    if (!res.ok || !data.url) throw new Error(data.error || 'Could not store that file')
    return data.url
  }

  async function uploadFile(file: File) {
    const type = file.type || ''
    if (type !== 'image/png' && type !== 'image/jpeg') {
      throw new Error('Use a PNG or JPEG file.')
    }
    // Direct-to-R2 uploads skip Vercel’s body limit. 50MB covers a high-res
    // print PNG without decoding a huge file into the fitting-room canvas.
    const directMaxBytes = 50 * 1024 * 1024
    if (file.size > directMaxBytes) {
      throw new Error('Image is over 50MB. Export a smaller PNG or JPEG.')
    }

    const report = (ratio: number) => setUploadProgress(Math.max(0, Math.min(100, Math.round(ratio * 100))))
    setUploadProgress(0)
    setBusy('Uploading')
    try {
      // Preferred path: direct-to-storage (no function body limit).
      const directUrl = await uploadViaSignedUrl(file, report)
      if (directUrl) {
        report(1)
        refreshUploads()
        await placeArt(directUrl)
        return
      }

      // Files over ~4MB cannot go through one Vercel request. Send them in pieces.
      if (file.size > 4 * 1024 * 1024) {
        const chunkUrl = await uploadViaChunks(file, report)
        report(1)
        refreshUploads()
        await placeArt(chunkUrl)
        return
      }

      // Fallback: multipart through the API (works in dev / for small files).
      const body = new FormData()
      body.set('file', file)
      const res = await requestWithProgress(
        '/api/admin/merch/art',
        { method: 'POST', body },
        (loaded, total) => report(total > 0 ? loaded / total : 0),
      )
      let data: { error?: string; url?: string } = {}
      try {
        data = JSON.parse(res.text || '{}')
      } catch {
        /* non-JSON error body (e.g. a platform 413) */
      }
      if (!res.ok) {
        const message =
          res.status === 413
            ? 'That image is too large to upload here. Please use a file under ~4MB.'
            : data.error || 'Upload failed'
        throw new Error(message)
      }
      if (!data.url) throw new Error('Upload failed')
      report(1)
      refreshUploads()
      await placeArt(data.url)
    } finally {
      setUploadProgress(null)
      setBusy(null)
    }
  }

  async function applyEditedArt(previousUrl: string, blob: Blob, mode: 'replace' | 'copy') {
    setBusy(mode === 'copy' ? 'Saving new art' : 'Saving edit')
    setNote(null)
    try {
      const savedUrl = await storePreparedArt(
        new File([blob], mode === 'copy' ? 'edited-copy.png' : 'edited.png', { type: 'image/png' }),
        mode === 'replace' && blob.size <= SINGLE_UPLOAD_BYTES ? { replaceUrl: previousUrl } : {},
      )
      if (mode === 'replace') {
        const nextUrl = withArtVersion(savedUrl, Date.now())
        const image = await loadImage(nextUrl)
        pushStudioUndo()
        const swap = (art: ArtPlacement): ArtPlacement =>
          sameMerchArt(art.assetUrl, previousUrl)
            ? {
                ...art,
                assetUrl: nextUrl,
                assetWidth: image.naturalWidth || art.assetWidth,
                assetHeight: image.naturalHeight || art.assetHeight,
              }
            : art
        setLayers((current) => {
          const next = { ...current }
          for (const key of Object.keys(next) as PlacementId[]) {
            const art = next[key]
            if (art) next[key] = swap(art)
          }
          return next
        })
        setCatalogFileLayers((current) => {
          const next = { ...current }
          for (const key of Object.keys(next)) {
            const art = next[key]
            if (art) next[key] = swap(art)
          }
          return next
        })
      }
      refreshUploads()
      setNote(mode === 'copy' ? 'Saved as new art in the library.' : 'Edit replaced the original artwork.')
    } catch (error: unknown) {
      setNote(error instanceof Error ? error.message : 'Could not save the edit')
      throw error
    } finally {
      setBusy(null)
    }
  }

  async function removeBackgroundArt(url: string) {
    setBusy('Removing background')
    setNote(null)
    try {
      const image = await loadImage(url, true)
      const canvas = document.createElement('canvas')
      canvas.width = image.naturalWidth
      canvas.height = image.naturalHeight
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('Could not read that image')
      ctx.drawImage(image, 0, 0)
      const source = ctx.getImageData(0, 0, canvas.width, canvas.height)
      const cleaned = removeSolidBackground({
        data: source.data,
        width: canvas.width,
        height: canvas.height,
      })
      source.data.set(cleaned.data)
      ctx.putImageData(source, 0, 0)
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
      if (!blob) throw new Error('Could not export the cut-out')
      const storedUrl = await storePreparedArt(new File([blob], 'cutout.png', { type: 'image/png' }))
      refreshUploads()
      await placeArt(storedUrl)
      setNote('Background removed. Transparent art placed on the active area.')
    } catch (error: any) {
      setNote(error?.message || 'Could not remove the background')
    } finally {
      setBusy(null)
    }
  }

  /**
   * Raise the active placement's art past the 150 DPI print threshold, keeping its
   * current size and position. Prefers Picsart's AI upscaler (real detail) and
   * falls back to a local high-quality canvas resample when no key is configured.
   */
  async function optimizePrintQuality() {
    if (!layer?.assetUrl) {
      setNote('Place some art first, then optimize it.')
      return
    }
    const currentDpi = effectiveDpi(layer, area)
    if (!Number.isFinite(currentDpi) || currentDpi <= 0) {
      setNote('Place some art first, then optimize it.')
      return
    }
    if (dpiGrade(currentDpi) === 'good') {
      setNote('Print quality is already at 150+ DPI.')
      return
    }

    setBusy('Optimizing print quality')
    setNote(null)
    const previousUrl = layer.assetUrl
    const sourceW = layer.assetWidth
    // Aim a little past 150 DPI for margin.
    const TARGET_DPI = 165
    const neededFactor = Math.min(8, Math.max(2, Math.ceil(TARGET_DPI / currentDpi)))

    // Swap the upscaled art into every placement that references the old art,
    // keeping scale/position/rotation so only the resolution changes.
    const swapLayer = (nextUrl: string, nextW: number, nextH: number) => {
      pushStudioUndo()
      const swap = (art: ArtPlacement): ArtPlacement =>
        sameMerchArt(art.assetUrl, previousUrl)
          ? { ...art, assetUrl: nextUrl, assetWidth: nextW, assetHeight: nextH }
          : art
      setLayers((current) => {
        const next = { ...current }
        for (const key of Object.keys(next) as PlacementId[]) {
          const art = next[key]
          if (art) next[key] = swap(art)
        }
        return next
      })
      setCatalogFileLayers((current) => {
        const next = { ...current }
        for (const key of Object.keys(next)) {
          const art = next[key]
          if (art) next[key] = swap(art)
        }
        return next
      })
    }

    const reportDpi = (nextW: number) =>
      sourceW > 0 && nextW > 0
        ? Math.round(currentDpi * (nextW / sourceW))
        : Math.round(currentDpi * neededFactor)

    try {
      // 1) Try Picsart AI upscaling (best quality) when the key is configured.
      try {
        const res = await fetch('/api/admin/merch/art/upscale', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: previousUrl, factor: neededFactor }),
        })
        if (res.ok) {
          const data = await res.json()
          if (data.url) {
            const nextUrl = withArtVersion(String(data.url), Date.now())
            const image = await loadImage(nextUrl, true)
            const nextW = image.naturalWidth || Math.round(sourceW * neededFactor)
            const nextH = image.naturalHeight || Math.round(layer.assetHeight * neededFactor)
            swapLayer(nextUrl, nextW, nextH)
            refreshUploads()
            setNote(`Print quality optimized with Picsart to about ${reportDpi(nextW)} DPI.`)
            return
          }
        } else if (res.status !== 503) {
          const data = await res.json().catch(() => null)
          console.error('picsart upscale:', data?.error)
        }
      } catch (error) {
        console.error('picsart upscale request failed:', error)
      }

      // 2) Local high-quality canvas resample fallback.
      const image = await loadImage(previousUrl, true)
      const srcW = image.naturalWidth || sourceW
      const srcH = image.naturalHeight || layer.assetHeight
      if (srcW <= 0 || srcH <= 0) throw new Error('Could not read that image')
      const MAX_EDGE = 4500
      const factor = Math.min(TARGET_DPI / currentDpi, MAX_EDGE / Math.max(srcW, srcH), 4)
      if (factor <= 1.01) {
        setNote('This art is already at the maximum useful print resolution.')
        return
      }
      const nextW = Math.round(srcW * factor)
      const nextH = Math.round(srcH * factor)
      const canvas = document.createElement('canvas')
      canvas.width = nextW
      canvas.height = nextH
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('Could not prepare the canvas')
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(image, 0, 0, nextW, nextH)
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
      if (!blob) throw new Error('Could not export the optimized art')
      const storedUrl = await storePreparedArt(new File([blob], 'optimized.png', { type: 'image/png' }))
      const nextUrl = withArtVersion(storedUrl, Date.now())
      swapLayer(nextUrl, nextW, nextH)
      refreshUploads()
      setNote(`Print quality optimized to about ${reportDpi(nextW)} DPI.`)
    } catch (error: unknown) {
      setNote(error instanceof Error ? error.message : 'Could not optimize print quality')
    } finally {
      setBusy(null)
    }
  }

  async function persist(nextStatus?: DesignStatus, stitchFiles?: Record<string, string>): Promise<MerchDesign> {
    const res = await fetch('/api/admin/merch/designs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: designId,
        blankId: blank.id,
        catalogProductId,
        name: name.trim() || blank.name,
        placements: activePlacements,
        activeFileType: activePrintFileType || null,
        colors,
        sizes,
        previewColor,
        previewColorName,
        ...(stitchFiles ? { printFileUrls: stitchFiles } : {}),
        retailPrice: price,
        status: nextStatus,
        embroideryUnlimitedColor,
        embroideryThreads: embroideryUnlimitedColor
          ? embroideryThreads
          : resolveEmbroideryThreads(
              activePlacements.map((placement) => placement.fileType || '').filter(Boolean),
              embroideryThreads,
              previewColor,
              catalogStudio?.threadOptionIds || [],
              previewColorName,
            ),
      }),
    })
    const data = await responseJson<{ error?: string; design?: MerchDesign }>(res)
    if (!res.ok || !data.design) throw new Error(data.error || 'Could not save')
    const design = data.design
    setDesignId(design.id)
    setStatus(design.status)
    setName(design.name)
    writeStudioDesignId(design.id)
    if (!designId && catalogProductId != null) {
      const carried = readProductMats()[`catalog:${catalogProductId}`]
      if (carried != null) {
        writeProductMat(design.id, carried)
        setProductMats(readProductMats())
      }
    }
    refreshSaved()
    markCleanRef.current()
    return design
  }

  async function bakePrint(placement: ArtPlacement, printArea: BlankPlacement): Promise<string> {
    const placed = containPlacement(placement, printArea)
    const canvas = document.createElement('canvas')
    canvas.width = printArea.printWidth
    canvas.height = printArea.printHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Could not prepare the print file')
    const image = await loadImage(placed.assetUrl, true)
    const drawW = placed.scale * printArea.printWidth
    const drawH = drawW * (image.naturalHeight / image.naturalWidth)
    const cx = placed.x * printArea.printWidth + drawW / 2
    const cy = placed.y * printArea.printHeight + drawH / 2
    ctx.translate(cx, cy)
    ctx.rotate((placed.rotation * Math.PI) / 180)
    ctx.drawImage(image, -drawW / 2, -drawH / 2, drawW, drawH)
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((value) => (value ? resolve(value) : reject(new Error('Could not bake the print'))), 'image/png')
    })
    const file = new File([blob], `${placement.placement}.png`, { type: 'image/png' })
    const previous = printFileUrlsRef.current[placementKey(placement)]
    const previousId = previous ? merchArtIdFromUrl(previous) : null
    const assetId = merchArtIdFromUrl(placement.assetUrl)
    const replaceUrl = previous && previousId && previousId !== assetId ? previous : null
    return storePreparedArt(file, { replaceUrl, origin: 'print' })
  }

  function printAreaForPlacement(placement: ArtPlacement): BlankPlacement | undefined {
    if (catalogStudio && placement.fileType) {
      const file = catalogStudio.printFiles.find((row) => row.type === placement.fileType)
      if (file) return placementForPrintFile(file, blank)
    }
    return garmentPlacements.find((item) => item.id === placement.placement)
  }

  async function pullStitchFile() {
    const jobs = activePlacements.filter((placement) => printAreaForPlacement(placement))
    if (jobs.length === 0) {
      setNote('Add art before pulling a stitch file.')
      return
    }
    setBusy('Pulling stitch file')
    setNote('Saving the stitch file.')
    try {
      const files = { ...printFileUrlsRef.current }
      for (const placement of jobs) {
        const printArea = printAreaForPlacement(placement)
        if (!printArea) continue
        files[placementKey(placement)] = await bakePrint(placement, printArea)
      }
      printFileUrlsRef.current = files
      setPrintFileUrls(files)
      await persist(undefined, files)
      setNote('Stitch file saved.')
    } catch (error: unknown) {
      setNote(error instanceof Error ? error.message : 'Could not save the stitch file')
    } finally {
      setBusy(null)
    }
  }

  async function bakeActivePrintFiles(run: number): Promise<Record<string, string> | null> {
    const still = () => publishRun.current === run
    const printFiles: Record<string, string> = {}
    const jobs = activePlacements.filter((placement) => {
      let printArea = garmentPlacements.find((item) => item.id === placement.placement)
      if (catalogStudio && placement.fileType) {
        const file = catalogStudio.printFiles.find((row) => row.type === placement.fileType)
        if (file) printArea = placementForPrintFile(file, blank)
      }
      return Boolean(printArea)
    })
    for (let index = 0; index < jobs.length; index += 1) {
      if (!still()) return null
      const placement = jobs[index]
      setPublishProgress({
        value: 18 + Math.round((index / Math.max(jobs.length, 1)) * 48),
        label: jobs.length > 1 ? `Preparing print file ${index + 1} of ${jobs.length}` : 'Preparing print file',
      })
      let printArea = garmentPlacements.find((item) => item.id === placement.placement)
      if (catalogStudio && placement.fileType) {
        const file = catalogStudio.printFiles.find((row) => row.type === placement.fileType)
        if (file) printArea = placementForPrintFile(file, blank)
      }
      if (!printArea) continue
      printFiles[placementKey(placement)] = await bakePrint(placement, printArea)
    }
    return still() ? printFiles : null
  }

  async function requestPrintfulPhotos(
    design: MerchDesign,
    run: number,
    endpoint: 'previews' | 'publish',
  ) {
    const still = () => publishRun.current === run
    setNote('Preparing the print file.')
    const printFiles = await bakeActivePrintFiles(run)
    if (!printFiles || !still()) return
    setNote(endpoint === 'publish' ? 'Sending it to Printful.' : 'Asking Printful for new photos.')
    setPublishProgress({ value: 72, label: endpoint === 'publish' ? 'Sending to Printful' : 'Making photos' })
    const res = await fetch(`/api/admin/merch/designs/${design.id}/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ printFiles }),
    })
    const data = await responseJson<{ error?: string; design?: MerchDesign }>(res)
    if (!res.ok || !data.design) throw new Error(data.error || 'Could not update the Printful photos')
    if (!still()) return
    const next = data.design as MerchDesign
    if (next.printFileUrls) {
      printFileUrlsRef.current = next.printFileUrls
      setPrintFileUrls(next.printFileUrls)
    }
    setStatus(next.status)
    setNote(next.publishNote)
    setWholesale(next.wholesaleCost ?? wholesale)
    setCostLive(next.variants.length > 0)
    if (next.mockupTaskKey) {
      setPublishProgress({ value: 82, label: 'Making photos' })
      void pollMockups(next.id, run)
    } else if (still()) {
      setPublishProgress(null)
    }
    refreshSaved()
  }

  async function saveDraft() {
    const run = publishRun.current + 1
    publishRun.current = run
    const still = () => publishRun.current === run
    setBusy('Saving')
    setNote('Saving the design.')
    setPublishProgress({ value: 8, label: 'Saving' })
    try {
      const design = await persist('draft')
      if (!still()) return
      if (activePlacements.length === 0 || !printfulReady?.canPublish || !printfulReady.publicArtOrigin) {
        setNote(design.publishNote || 'Draft saved — listed under Drafts in the catalog.')
        setPublishProgress(null)
        return
      }
      await requestPrintfulPhotos(design, run, 'previews')
    } catch (error: any) {
      if (still()) {
        setNote(error.message)
        setPublishProgress(null)
      }
    } finally {
      if (still()) setBusy(null)
    }
  }

  async function photographColor() {
    const run = publishRun.current + 1
    publishRun.current = run
    const still = () => publishRun.current === run
    setBusy('Photographing')
    setNote(`Photographing ${previewColorName || 'this color'}.`)
    setPublishProgress({ value: 8, label: 'Photographing' })
    try {
      const design = await persist()
      if (!still()) return
      if (activePlacements.length === 0 || !printfulReady?.canPublish || !printfulReady.publicArtOrigin) {
        setNote(design.publishNote || 'Save the design on the live site to photograph this color.')
        setPublishProgress(null)
        return
      }
      await requestPrintfulPhotos(design, run, 'previews')
    } catch (error: unknown) {
      if (still()) {
        setNote(error instanceof Error ? error.message : 'Could not photograph this color')
        setPublishProgress(null)
      }
    } finally {
      if (still()) setBusy(null)
    }
  }

  async function saveHidden() {
    setBusy('Saving hidden')
    try {
      const design = await persist('hidden')
      setNote(design.publishNote || 'Saved as hidden — listed under Hidden in the catalog.')
    } catch (error: any) {
      setNote(error.message)
    } finally {
      setBusy(null)
    }
  }

  async function putItOut() {
    if (activePlacements.length === 0) return
    if (designIssues.outside.length > 0) {
      setNote(`Art is outside the print area on: ${designIssues.outside.join(', ')}.`)
      return
    }
    if (placementConflicts.length > 0) {
      setNote(placementConflicts[0])
      return
    }
    if (designIssues.lowDpi.length > 0) {
      const proceed = window.confirm(
        `Low resolution (under 100 DPI) on: ${designIssues.lowDpi.join(', ')}.\n\nPut it out anyway?`
      )
      if (!proceed) return
    }
    if (!printfulReady?.canPublish) {
      setNote(
        'Finish Printful setup: add PRINTFUL_API_KEY and PRINTFUL_STORE_ID to web/.env.local, restart dev, then Re-check connection at the top of the merch desk.'
      )
      return
    }
    if (printfulReady && !printfulReady.publicArtOrigin) {
      setNote('Set NEXT_PUBLIC_SITE_URL to a public https URL so Printful can fetch your art files.')
      return
    }
    const run = publishRun.current + 1
    publishRun.current = run
    const stillThisRun = () => publishRun.current === run
    setBusy('Putting it out')
    setNote('Saving the design.')
    setPublishProgress({ value: 8, label: 'Saving' })
    try {
      const design = await persist('draft')
      if (!stillThisRun()) return
      await requestPrintfulPhotos(design, run, 'publish')
    } catch (error: any) {
      if (stillThisRun()) {
        setNote(error.message)
        setPublishProgress(null)
      }
    } finally {
      if (stillThisRun()) setBusy(null)
    }
  }

  function finishPublishProgress(run: number) {
    setPublishProgress({ value: 100, label: 'Photos ready' })
    window.setTimeout(() => {
      if (publishRun.current === run) setPublishProgress(null)
    }, 1200)
  }

  async function pollMockups(id: string, run: number) {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 2500))
      if (publishRun.current !== run) return
      const res = await fetch(`/api/admin/merch/designs/${id}/mockups`)
      if (!res.ok) {
        if (publishRun.current === run) setPublishProgress(null)
        return
      }
      const data = await res.json()
      if (publishRun.current !== run) return
      if ((data.status === 'completed' || data.status === 'storing') && data.design) {
        const urls = data.design.mockupUrls || []
        const byColor = (data.design.mockupUrlsByColor || {}) as Record<string, string[]>
        const titles = (data.design.mockupAngleTitlesByColor || {}) as Record<string, string[]>
        const any = urls.length > 0 || Object.values(byColor).some((list) => list.length > 0)
        setMockupUrls(urls)
        setMockupUrlsByColor(byColor)
        setMockupAngleTitlesByColor(titles)
        setMockupColor(any ? data.design.previewColor || null : null)
        setMockupColorName(any ? data.design.previewColorName || previewColorName : null)
        if (any) setStandIn(false)
        setNote(data.design.publishNote)
        refreshSaved()
        if (data.status === 'completed') {
          finishPublishProgress(run)
          refreshUploads()
          return
        }
        setPublishProgress({ value: Math.min(96, 88), label: 'Saving color angles' })
        continue
      }
      if (data.status === 'failed') {
        setPublishProgress(null)
        setNote('Printful could not make the photos. Put it out again.')
        return
      }
      setPublishProgress({
        value: Math.min(96, 84 + Math.round(((attempt + 1) / 8) * 12)),
        label: 'Making photos',
      })
    }
    if (publishRun.current === run) {
      setPublishProgress(null)
      setNote('Printful is still making the photos. They will show up on this product when they are ready.')
    }
  }

  async function setVisibility(next: 'live' | 'hidden') {
    if (!designId) {
      setNote('Put it out before making it public.')
      return
    }
    setBusy(next === 'live' ? 'Publishing' : 'Hiding')
    try {
      const res = await fetch(`/api/admin/merch/designs/${designId}/visibility`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      })
      const data = await responseJson<{ error?: string; design?: MerchDesign }>(res)
      if (!res.ok || !data.design) throw new Error(data.error || 'Could not update the shop')
      setStatus(data.design.status)
      setNote(data.design.publishNote)
      refreshSaved()
    } catch (error: any) {
      setNote(error.message)
    } finally {
      setBusy(null)
    }
  }

  const layerHeightFraction = (faceLayer: ArtPlacement | undefined, faceArea: BlankPlacement) => {
    if (!faceLayer || faceArea.printWidth <= 0 || faceLayer.assetWidth <= 0) return faceLayer?.scale || 0
    return (
      (faceLayer.scale * faceArea.printWidth * (faceLayer.assetHeight / faceLayer.assetWidth)) /
      faceArea.printHeight
    )
  }

  const heightFraction = layerHeightFraction(layer, area)

  const selectDesignTab = (id: string) => {
    selectPlacementTab(id)
  }

  const matKey = productMatKey(designId, catalogProductId)
  const stageTone = resolveProductMat(productMats, matKey)
  const stageMat = stageTone == null ? null : productMatColor(stageTone)
  const lightBackdrop =
    stageTone != null
      ? stageTone > 170
      : channelLuma(hexToRgb(designGarment?.backgroundColor) || { r: 20, g: 20, b: 20 }) > 170

  const onStageBackgroundContextMenu = (event: ReactMouseEvent) => {
    const target = event.target
    if (!(target instanceof Element) || target.closest('button, a, input, textarea, [data-art-layer]')) return
    event.preventDefault()
    const menuWidth = 220
    const menuHeight = 228
    setStageToneMenu({
      x: Math.min(event.clientX, window.innerWidth - menuWidth - 8),
      y: Math.min(event.clientY, window.innerHeight - menuHeight - 8),
    })
  }

  const setStageBackgroundTone = (tone: number | null) => {
    if (!matKey) return
    const next = tone == null ? null : Math.max(0, Math.min(255, Math.round(tone)))
    writeProductMat(matKey, next)
    setProductMats(readProductMats())
  }

  const applyStageBackgroundToAll = () => {
    const next = stageTone == null ? null : Math.max(0, Math.min(255, Math.round(stageTone)))
    writeAllProductMats(next)
    setProductMats(readProductMats())
  }

  const placedLayers = (
    techniquePrintFiles.length > 0
      ? techniquePrintFiles.map((file) => {
          const art = catalogFileLayers[file.type]
          if (!art?.assetUrl) return null
          return { id: file.type, label: placementTabLabel(file.title || file.type), url: art.assetUrl }
        })
      : garmentPlacements.map((item) => {
          const art = layers[item.id]
          if (!art?.assetUrl) return null
          return { id: item.id, label: item.label, url: art.assetUrl }
        })
  ).filter((item): item is { id: string; label: string; url: string } => Boolean(item))

  const studioPanelBg = {
    background: 'radial-gradient(ellipse at 50% 38%, #2c2c2c 0%, #141414 68%)',
  }

  return (
    <div className="space-y-3">
    {editingArt ? (
      <MerchArtEditor
        url={editingArt}
        busy={busy === 'Saving edit' || busy === 'Saving new art'}
        onClose={() => setEditingArt(null)}
        onApply={(blob, mode) => applyEditedArt(editingArt, blob, mode)}
      />
    ) : null}
    {viewingArt ? (
      <div
        className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 p-16"
        onClick={() => setViewingArt(null)}
      >
        <div className="relative" onClick={(event) => event.stopPropagation()}>
          <button
            type="button"
            aria-label="Close image"
            onClick={() => setViewingArt(null)}
            className="absolute -right-12 -top-12 flex h-10 w-10 items-center justify-center rounded-full border border-white/30 bg-zinc-950 text-xl leading-none text-white hover:bg-white hover:text-black"
          >
            ×
          </button>
          <img
            src={viewingArt}
            alt=""
            className="max-h-[80vh] max-w-[80vw] object-contain"
          />
        </div>
      </div>
    ) : null}
    <MerchLeaveDesignDialog
      open={Boolean(leavePrompt)}
      detail={leavePrompt?.detail || ''}
      busy={busy === 'Saving'}
      onKeepWorking={() => setLeavePrompt(null)}
      onDiscard={() => {
        const pending = leavePrompt
        setLeavePrompt(null)
        if (pending) void pending.run()
      }}
      onSaveAndContinue={() => {
        const pending = leavePrompt
        if (!pending) return
        void (async () => {
          try {
            await persist('draft')
            setLeavePrompt(null)
            setNote('Draft saved. Opening the next project.')
            await pending.run()
          } catch (error: unknown) {
            setNote(error instanceof Error ? error.message : 'Could not save this draft')
          }
        })()
      }}
    />
    <div
      className={`grid grid-cols-1 gap-4 min-h-[780px] xl:h-[max(780px,calc(100vh-10rem))] xl:min-h-0 ${catalogColumnResizing ? 'select-none' : ''}`}
      style={
        studioGridXl
          ? {
              gridTemplateColumns: `${
                catalogPanelCollapsed ? CATALOG_PANEL_COLLAPSED_WIDTH : catalogColumnWidth
              }px minmax(0, 1fr) ${
                designPanelCollapsed
                  ? DESIGN_PANEL_COLLAPSED_WIDTH
                  : catalogStudio
                    ? DESIGN_PANEL_WIDTH
                    : 280
              }px`,
            }
          : undefined
      }
    >

      <aside className="relative flex h-[70vh] min-h-[360px] flex-col overflow-hidden xl:h-full xl:min-h-0">
        <MerchPrintfulCatalog
          activeCatalogId={catalogProductId}
          designs={saved.map((design) =>
            design.id === designId
              ? {
                  ...design,
                  previewColor,
                  colors,
                  sizes,
                  mockupUrls: mockupUrls.length > 0 ? mockupUrls : design.mockupUrls,
                }
              : design
          )}
          onSelect={(product) => void selectCatalogProduct(product)}
          onOpenDesign={(design) => void selectSavedDesign(design)}
          onDesignsChanged={refreshSaved}
          onDesignUpdated={(design) => {
            if (design.id !== designId) return
            setName(design.name)
            setStatus(design.status)
            if (design.publishNote) setNote(design.publishNote)
          }}
          onDesignRemoved={(id) => {
            refreshUploads()
            if (id !== designId) return
            setDesignId(null)
            setStatus('draft')
            setCatalogFileLayers({})
            setLayers({})
            setMockupUrls([])
            setMockupUrlsByColor({})
            setMockupAngleTitlesByColor({})
            setMockupColor(null)
            setMockupColorName(null)
            setStandIn(true)
            printFileUrlsRef.current = {}
            setPrintFileUrls({})
            setNote(`“${name}” and its files were deleted.`)
          }}
          onCatalogPanelCollapsedChange={setCatalogPanelCollapsed}
          productMats={productMats}
        />
        {!catalogPanelCollapsed ? (
          <div
            role="separator"
            aria-orientation="vertical"
            aria-valuenow={catalogColumnWidth}
            aria-valuemin={CATALOG_COLUMN_MIN}
            aria-valuemax={CATALOG_COLUMN_MAX}
            aria-label="Resize Printful catalog column"
            title="Drag to resize · double-click to reset"
            onPointerDown={onCatalogColumnResizeStart}
            onDoubleClick={resetCatalogColumnWidth}
            className={`group absolute -right-2 top-0 z-20 hidden h-full w-4 cursor-col-resize touch-none xl:block ${
              catalogColumnResizing ? 'bg-white/10' : 'hover:bg-white/5'
            }`}
          >
            <span
              className={`pointer-events-none absolute inset-y-3 left-1/2 w-0.5 -translate-x-1/2 rounded-full transition-colors ${
                catalogColumnResizing ? 'bg-white/70' : 'bg-gray-600 group-hover:bg-gray-400'
              }`}
            />
          </div>
        ) : null}
      </aside>

      <section
        className="relative flex min-h-[680px] flex-col overflow-hidden rounded-2xl border border-white/10 text-white xl:h-full xl:min-h-0"
        style={studioPanelBg}
      >
          <MerchDesignCanvas
            tabs={designTabs}
            activeTabId={activeDesignTabId}
            onTab={selectDesignTab}
            colorName={previewColorName}
            colorHex={previewColor}
            garmentUrl={designGarmentUrl}
            garmentBackground={designPatternUrl ? null : designGarment?.backgroundColor || previewColor}
            patternUrl={designPatternUrl}
            garmentTexture={designPatternUrl ? null : designGarment?.backgroundUrl || null}
            useTemplateMockup={designUsesTemplateMockup}
            garmentAspect={designUsesTemplateMockup ? activePrintFile?.templateAspect ?? null : null}
            family={blank.family}
            placementId={area.id}
            area={area}
            areaRef={areaRef}
            layer={layer}
            outside={outside}
            onDropFile={(file) => uploadFile(file).catch((error) => setNote(error.message))}
            onUploadClick={() => uploadInputRef.current?.click()}
            onArtPointerDown={onPointerDown}
            onArtPointerMove={onPointerMove}
            onArtPointerUp={onPointerUp}
            onArtWheel={onWheel}
            onArtContextMenu={(event) => {
              event.preventDefault()
              event.stopPropagation()
              setArtMenu({ target: 'stage', x: event.clientX, y: event.clientY })
            }}
            onArtAdjust={onArtAdjust}
            onArtAdjustStart={onArtAdjustStart}
            onArtAdjustEnd={onArtAdjustEnd}
            onOptimizeForPrint={optimizeForPrint}
            showPrintGuide={showGuide}
            printInsetX={insetX}
            printInsetY={insetY}
            boundToInset={stitch.x > 0 || stitch.y > 0}
            activeDpiGrade={activeDpiGrade}
            snapGuides={snapGuides}
            showRotationGuides={showRotationGuides}
            onRotationGuide={setShowRotationGuides}
            stageToolbar={stageToolbar}
            underTabs={
              <StageModeSwitch
                view={stageView}
                onChange={onStageViewChange}
                zoom={stageView === 'preview' ? stageZoom : undefined}
                onZoom={stageView === 'preview' ? setStageZoom : undefined}
              />
            }
            matColor={stageMat}
            onStageBackdropContextMenu={onStageBackgroundContextMenu}
            productName={name}
            onProductName={setName}
            readOnly={stageView !== 'design'}
            zoom={stageView === 'preview' ? stageZoom : 1}
          />
        <div className="shrink-0 px-4 pb-3 pt-1">
          <DesignSaveRow toolbar={stageToolbar} />
        </div>
      </section>

      <aside
        className={`relative flex min-h-[360px] flex-col overflow-hidden rounded-2xl border border-white/10 text-white xl:h-full xl:min-h-0 ${
          designPanelCollapsed ? 'cursor-pointer hover:bg-white/[0.03]' : catalogStudio ? '' : 'p-4'
        }`}
        style={studioPanelBg}
        {...(designPanelCollapsed
          ? {
              role: 'button' as const,
              tabIndex: 0,
              'aria-label': 'Expand product design panel',
              title: 'Click to expand product design',
              onClick: expandDesignPanel,
              onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  expandDesignPanel()
                }
              },
            }
          : {})}
      >
        {catalogStudio ? (
          <>
            <div className="relative flex h-[45px] shrink-0 items-center justify-center border-b border-white/10 bg-black/30">
              {!designPanelCollapsed ? (
                <span className="pointer-events-none min-w-0 truncate px-10 text-center text-[10px] font-medium uppercase tracking-[0.18em] text-white/45">
                  Product Design
                </span>
              ) : null}
              {designPanelCollapsed ? (
                <span
                  aria-hidden
                  className="absolute right-1.5 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center text-gray-400"
                >
                  <PanelChevron direction="left" />
                </span>
              ) : (
                <button
                  type="button"
                  aria-label="Collapse product design panel"
                  aria-expanded
                  title="Collapse product design"
                  onClick={() => setDesignPanelCollapsedPersist(true)}
                  className="absolute right-1.5 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-gray-400 transition hover:bg-gray-800 hover:text-white"
                >
                  <PanelChevron direction="right" />
                </button>
              )}
            </div>
            {designPanelCollapsed ? (
              <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden py-6">
                <span
                  aria-hidden
                  className="select-none text-[10px] font-medium uppercase tracking-[0.18em] text-white/45 [writing-mode:vertical-rl] rotate-180"
                >
                  Product Design
                </span>
              </div>
            ) : (
          <MerchDesignSidebar
            nav={designNav}
            onNav={setDesignNav}
            activeDpiGrade={activeDpiGrade}
            onOptimizeQuality={optimizePrintQuality}
            placementScale={layer?.scale ?? 1}
            placementScaleMax={layer ? maxScaleInMitigation(layer, area) : 1}
            placementRotation={layer?.rotation ?? 0}
            onFitPlacement={fit}
            onCenterPlacement={center}
            onOptimizeForPrint={optimizeForPrint}
            onPlacementScale={(value) => {
              updateLayer({ scale: value })
              flashGuide()
            }}
            onPlacementRotate={applyRotation}
            onResetPlacementScale={resetScale}
            onResetPlacementRotation={straightenActive}
            onPlacementGestureStart={() => {
              sliderSnapshotRef.current = studioSnapshotFrom(layersRef.current, catalogFileLayersRef.current)
            }}
            onPlacementGestureEnd={finishSliderEdit}
            onPlacementRotateStart={beginRotationGuide}
            onPlacementRotateEnd={endRotationGuide}
            detail={catalogStudio}
            technique={catalogTechnique}
            techniques={catalogStudio.techniques}
            onTechnique={pickCatalogTechnique}
            printFiles={techniquePrintFiles}
            activePrintFileType={activePrintFile?.type || activePrintFileType}
            embroideryUnlimitedColor={embroideryUnlimitedColor}
            onEmbroideryUnlimitedColor={chooseEmbroideryColorOption}
            embroideryThreadNote={embroideryThreadNote}
            embroideryThreadColors={selectedEmbroideryThreads}
            onEmbroideryThreadColor={pickEmbroideryThread}
            onPullStitchFile={() => void pullStitchFile()}
            onPhotographColor={() => void photographColor()}
            productName={name}
            onProductName={setName}
            previewColorName={previewColorName}
            swatchColors={swatchColors}
            onPreviewColor={pickPreviewColor}
            previewSize={previewSize}
            onPreviewSize={setPreviewSize}
            sizes={sizes}
            onToggleSize={(size) =>
              setSizes((current) => {
                if (current.includes(size)) {
                  return current.length === 1 ? current : current.filter((item) => item !== size)
                }
                return [...current, size]
              })
            }
            onSetSizes={(next) => setSizes(next.length > 0 ? next : sizes.slice(0, 1))}
            uploadInputRef={uploadInputRef}
            onUploadFile={(file) => uploadFile(file).catch((error) => setNote(error.message))}
            uploads={uploads}
            activeLayerUrl={layer?.assetUrl}
            onPlaceArt={(url) => void placeArt(url)}
            onArtCreated={(url) => {
              refreshUploads()
              void placeArt(url)
            }}
            onRemoveBackground={(url) => removeBackgroundArt(url)}
            onUploadContextMenu={(event, upload) => {
              event.preventDefault()
              setArtMenu({ target: 'upload', x: event.clientX, y: event.clientY, upload })
            }}
            placed={placedLayers}
            onFocusLayer={selectDesignTab}
            saved={saved.map((item) => ({ id: item.id, name: item.name, status: item.status }))}
            onOpenSaved={(id) => {
              const design = saved.find((item) => item.id === id)
              if (design) void selectSavedDesign(design)
            }}
            addOnRows={catalogAddOnRows}
            wholesale={effectiveWholesale}
            costLive={costLive}
            price={price}
            onPrice={(value) => {
              setPriceTouched(true)
              setPrice(value)
            }}
            keep={keep}
            note={note}
            busy={busy}
            uploadProgress={uploadProgress}
            publishProgress={publishProgress}
            status={status}
            designId={designId}
            canPutOut={canPutOutDesign}
            onPutItOut={() => void putItOut()}
            onSaveDraft={() => void saveDraft()}
            onVisibility={() => void setVisibility(status === 'live' ? 'hidden' : 'live')}
            guidelinesOpen={guidelinesOpen}
            onToggleGuidelines={() => setGuidelinesOpen((open) => !open)}
          />
            )}
          </>
        ) : (
          <div className="space-y-4 overflow-y-auto p-4">
            <p className="text-[11px] text-white/50">
              Pick a product in the Printful catalog to load techniques, file placements, and upload tools.
            </p>
          </div>
        )}
      </aside>
    </div>
      {catalogStudio && (
        <div
          id="product-specs"
          className="scroll-mt-24 overflow-hidden rounded-2xl border border-white/10 text-white"
          style={studioPanelBg}
        >
          <MerchProductSpecs
            detail={catalogStudio}
            printFiles={techniquePrintFiles}
            technique={catalogTechnique}
            layout="stage"
          />
        </div>
      )}
      {printfulReady && (
        <div id="printful-api" className="space-y-2 scroll-mt-24">
          <MerchPrintfulSetupPanel status={printfulReady} onRefresh={refreshPrintfulStatus} />
          {printfulReady.canPublish && printfulReady.templatesReachable === false && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100/90">
              API key works but positioning templates did not load. Re-select your catalog product for calibrated drop
              zones, or verify token scopes in Printful.
            </div>
          )}
          {printfulReady.catalogStale && (
            <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/70">
              Printful catalog cache is empty or older than a week — syncing in the background. Use{' '}
              <strong>Sync</strong> in the catalog column to refresh now.
            </div>
          )}
        </div>
      )}
    {stageToneMenu ? (
      <div
        role="menu"
        aria-label="Stage background"
        className="fixed z-[90] w-[220px] space-y-3 rounded-xl border border-white/15 bg-zinc-950 p-3 text-white shadow-2xl"
        style={{ left: stageToneMenu.x, top: stageToneMenu.y }}
        onPointerDown={(event) => event.stopPropagation()}
        onContextMenu={(event) => event.preventDefault()}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] text-white/55">This product</span>
          <button
            type="button"
            role="menuitemradio"
            aria-checked={stageTone == null}
            onClick={() => setStageBackgroundTone(null)}
            className={`rounded-md px-2 py-1 text-[11px] ${
              stageTone == null ? 'bg-white text-black' : 'text-white/70 hover:bg-white/10'
            }`}
          >
            Original
          </button>
        </div>
        <div className="flex gap-1.5">
          {[
            { tone: 0, label: 'Black' },
            { tone: 44, label: 'Dark' },
            { tone: 128, label: 'Mid' },
            { tone: 210, label: 'Light' },
            { tone: 255, label: 'White' },
          ].map((swatch) => (
            <button
              key={swatch.label}
              type="button"
              role="menuitemradio"
              aria-label={swatch.label}
              aria-checked={stageTone === swatch.tone}
              title={swatch.label}
              onClick={() => setStageBackgroundTone(swatch.tone)}
              className={`h-7 flex-1 rounded-md border ${
                stageTone === swatch.tone ? 'border-white' : 'border-white/20'
              }`}
              style={{ backgroundColor: `rgb(${swatch.tone},${swatch.tone},${swatch.tone})` }}
            />
          ))}
        </div>
        <label className="block space-y-1">
          <span className="flex items-center justify-between text-[11px] text-white/70">
            Tone
            <span className="tabular-nums text-white/40">{stageTone == null ? 'Original' : stageTone}</span>
          </span>
          <input
            type="range"
            min={0}
            max={255}
            aria-label="Background tone from black to white"
            value={stageTone ?? 128}
            onChange={(event) => setStageBackgroundTone(Number(event.target.value))}
            className="w-full accent-white"
          />
        </label>
        <button
          type="button"
          role="menuitem"
          onClick={applyStageBackgroundToAll}
          className="w-full rounded-md border border-white/20 px-2 py-1.5 text-[11px] text-white/80 hover:bg-white/10 hover:text-white"
        >
          Apply to all products
        </button>
      </div>
    ) : null}
    {artMenuOpen && artMenu && (
      <StudioContextMenu
        open
        x={artMenu.x}
        y={artMenu.y}
        title={artMenuTitle}
        items={artMenuItems}
        onClose={() => setArtMenu(null)}
      />
    )}
    </div>
  )
}

function artFileName(url: string): string {
  const name = url.split('?')[0]?.split('/').pop()
  return name && name.includes('.') ? name : 'artwork.png'
}

