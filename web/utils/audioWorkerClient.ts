/**
 * Client-side wrapper for audio processing Web Worker
 * Provides a Promise-based API that maintains compatibility with existing code
 */

export interface PeakData {
  data: number[]
  length: number
  sampleRate: number
}

interface WorkerMessage {
  id: string
  type: 'generatePeaks' | 'detectBPM' | 'both'
  audioUrl: string
  samples?: number
}

interface WorkerResponse {
  id: string
  type: 'success' | 'error'
  data?: {
    peaks?: PeakData
    bpm?: number | null
  }
  error?: string
}

// Singleton worker instance
let workerInstance: Worker | null = null
let workerReady = false
const pendingRequests = new Map<string, {
  resolve: (value: any) => void
  reject: (error: Error) => void
}>()

// Initialize worker
function getWorker(): Worker | null {
  if (typeof window === 'undefined') {
    return null // SSR
  }

  if (workerInstance) {
    return workerInstance
  }

  try {
    // Create worker from public folder
    workerInstance = new Worker(new URL('/workers/audioWorker.js', window.location.origin))
    
    workerInstance.addEventListener('message', (event: MessageEvent<WorkerResponse>) => {
      const { id, type, data, error } = event.data
      
      const pending = pendingRequests.get(id)
      if (!pending) return
      
      pendingRequests.delete(id)
      
      if (type === 'success') {
        pending.resolve(data)
      } else {
        pending.reject(new Error(error || 'Worker error'))
      }
    })
    
    workerInstance.addEventListener('error', (error) => {
      console.error('Worker error:', error)
      // Reject all pending requests
      pendingRequests.forEach(({ reject }) => {
        reject(new Error('Worker error'))
      })
      pendingRequests.clear()
      workerInstance = null
    })
    
    workerReady = true
    return workerInstance
  } catch (error) {
    console.warn('Failed to create worker, falling back to main thread:', error)
    workerInstance = null
    workerReady = false
    return null
  }
}

// Generate unique ID for requests
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

/**
 * Generate peak data from audio file using Web Worker
 * Falls back to main thread if worker is unavailable
 */
export async function generatePeakData(audioFile: string, samples: number = 2000): Promise<PeakData> {
  const worker = getWorker()
  
  // Fallback to main thread if worker unavailable
  if (!worker) {
    return generatePeakDataMainThread(audioFile, samples)
  }
  
  return new Promise((resolve, reject) => {
    const id = generateId()
    
    pendingRequests.set(id, { resolve, reject })
    
    const message: WorkerMessage = {
      id,
      type: 'generatePeaks',
      audioUrl: audioFile,
      samples
    }
    
    worker.postMessage(message)
    
    // Timeout after 30 seconds
    setTimeout(() => {
      if (pendingRequests.has(id)) {
        pendingRequests.delete(id)
        reject(new Error('Worker timeout'))
      }
    }, 30000)
  }).then((data: any) => data.peaks)
}

/**
 * Detect BPM from audio file using Web Worker
 * Falls back to main thread if worker is unavailable
 */
export async function detectBPM(audioFile: string): Promise<number | null> {
  const worker = getWorker()
  
  // Fallback to main thread if worker unavailable
  if (!worker) {
    return detectBPMMainThread(audioFile)
  }
  
  return new Promise((resolve, reject) => {
    const id = generateId()
    
    pendingRequests.set(id, { resolve, reject })
    
    const message: WorkerMessage = {
      id,
      type: 'detectBPM',
      audioUrl: audioFile
    }
    
    worker.postMessage(message)
    
    // Timeout after 30 seconds
    setTimeout(() => {
      if (pendingRequests.has(id)) {
        pendingRequests.delete(id)
        reject(new Error('Worker timeout'))
      }
    }, 30000)
  }).then((data: any) => data.bpm).catch(() => null)
}

/**
 * Fallback: Generate peak data on main thread
 */
async function generatePeakDataMainThread(audioFile: string, samples: number = 2000): Promise<PeakData> {
  // Import the original function dynamically to avoid circular dependencies
  const { generatePeakData: originalGeneratePeakData } = await import('./audioAnalysis')
  return originalGeneratePeakData(audioFile, samples)
}

/**
 * Fallback: Detect BPM on main thread
 */
async function detectBPMMainThread(audioFile: string): Promise<number | null> {
  // Import the original function dynamically to avoid circular dependencies
  const { detectBPM: originalDetectBPM } = await import('./audioAnalysis')
  return originalDetectBPM(audioFile)
}

/**
 * Cleanup worker (useful for testing or cleanup)
 */
export function cleanupWorker(): void {
  if (workerInstance) {
    workerInstance.terminate()
    workerInstance = null
    workerReady = false
    pendingRequests.clear()
  }
}

