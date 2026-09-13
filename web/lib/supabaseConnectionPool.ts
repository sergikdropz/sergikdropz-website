/**
 * Supabase Connection Pool Manager
 * 
 * This module helps prevent connection exhaustion by:
 * 1. Limiting concurrent operations
 * 2. Implementing request queuing
 * 3. Adding retry logic with exponential backoff
 */

interface QueueItem {
  fn: () => Promise<any>
  resolve: (value: any) => void
  reject: (error: any) => void
  retries: number
}

class SupabaseConnectionPool {
  private queue: QueueItem[] = []
  private activeOperations = 0
  private readonly maxConcurrent: number
  private readonly maxRetries: number
  
  constructor(maxConcurrent = 10, maxRetries = 3) {
    this.maxConcurrent = maxConcurrent
    this.maxRetries = maxRetries
  }
  
  /**
   * Execute a Supabase operation with connection pooling
   */
  async execute<T>(fn: () => Promise<T>, retries = 0): Promise<T> {
    // If we're at max concurrent operations, queue this request
    if (this.activeOperations >= this.maxConcurrent) {
      return new Promise((resolve, reject) => {
        this.queue.push({ fn, resolve, reject, retries })
      })
    }
    
    this.activeOperations++
    
    try {
      const result = await fn()
      this.activeOperations--
      this.processQueue()
      return result
    } catch (error: any) {
      this.activeOperations--
      
      // Check if it's a connection timeout error
      const isTimeout = error.message?.includes('timed out') || 
                       error.message?.includes('timeout') ||
                       error.code === 'DatabaseTimeout'
      
      // Retry if it's a timeout and we haven't exceeded max retries
      if (isTimeout && retries < this.maxRetries) {
        console.log(`[ConnectionPool] Retrying operation (attempt ${retries + 1}/${this.maxRetries})`)
        
        // Exponential backoff: 1s, 2s, 4s
        const delay = Math.pow(2, retries) * 1000
        await new Promise(resolve => setTimeout(resolve, delay))
        
        return this.execute(fn, retries + 1)
      }
      
      this.processQueue()
      throw error
    }
  }
  
  /**
   * Process the next item in the queue
   */
  private processQueue() {
    if (this.queue.length === 0 || this.activeOperations >= this.maxConcurrent) {
      return
    }
    
    const item = this.queue.shift()
    if (!item) return
    
    this.execute(item.fn, item.retries)
      .then(item.resolve)
      .catch(item.reject)
  }
  
  /**
   * Get current pool statistics
   */
  getStats() {
    return {
      activeOperations: this.activeOperations,
      queuedOperations: this.queue.length,
      maxConcurrent: this.maxConcurrent,
    }
  }
}

// Export a singleton instance
export const connectionPool = new SupabaseConnectionPool(10, 3)

/**
 * Wrap a Supabase operation with connection pooling
 * 
 * @example
 * const result = await withConnectionPool(() => 
 *   supabase.from('table').select('*')
 * )
 */
export async function withConnectionPool<T>(fn: () => Promise<T>): Promise<T> {
  return connectionPool.execute(fn)
}
