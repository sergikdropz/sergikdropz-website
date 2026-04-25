import { createSupabaseServerClient } from './supabase'
import { getServerSession } from './auth'
import { headers } from 'next/headers'

export interface ActivityLogData {
  actionType: string
  resourceType?: string
  resourceId?: string
  details?: Record<string, any>
}

/**
 * Log an admin activity to the database
 * This should be called from API routes after successful operations
 */
export async function logActivity(data: ActivityLogData): Promise<void> {
  try {
    const session = await getServerSession()
    
    if (!session || !session.user) {
      // Silently fail if no session - this might be called from non-admin contexts
      return
    }

    const supabase = createSupabaseServerClient()
    
    // Get IP address from headers
    const headersList = await headers()
    const ipAddress = headersList.get('x-forwarded-for')?.split(',')[0] || 
                     headersList.get('x-real-ip') || 
                     'unknown'

    const { error } = await supabase
      .from('activity_logs')
      .insert({
        admin_id: session.user.id,
        action_type: data.actionType,
        resource_type: data.resourceType || null,
        resource_id: data.resourceId || null,
        details: data.details || null,
        ip_address: ipAddress !== 'unknown' ? ipAddress : null,
      })

    if (error) {
      // Log error but don't throw - activity logging shouldn't break the main operation
      console.error('Failed to log activity:', error)
    }
  } catch (error) {
    // Silently fail - activity logging is non-critical
    console.error('Activity logging error:', error)
  }
}

/**
 * Helper function to get IP address from request
 * For use in API routes where we have direct access to the request
 */
export function getClientIp(request: Request): string | null {
  const forwardedFor = request.headers.get('x-forwarded-for')
  const realIp = request.headers.get('x-real-ip')
  
  if (forwardedFor) {
    return forwardedFor.split(',')[0].trim()
  }
  
  return realIp || null
}
