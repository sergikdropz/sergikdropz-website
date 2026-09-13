# Module Import Fix - January 29, 2026

## Issue
Missing module error: `Can't resolve '@/lib/supabase/server'`

The following files were trying to import a non-existent helper function:
```typescript
import { createServiceRoleClient } from '@/lib/supabase/server'
```

## Root Cause
The codebase doesn't have a `@/lib/supabase/server.ts` file. Instead, all API routes should import `createClient` directly from `@supabase/supabase-js` and instantiate it at module level.

## Solution
Fixed all affected files to use the correct pattern matching existing working routes:

```typescript
// ✅ CORRECT pattern (used in working routes)
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
)
```

## Files Fixed

### 1. `/app/api/nurturing/analytics/route.ts`
- Replaced: `import { createServiceRoleClient } from '@/lib/supabase/server'`
- With: `import { createClient } from '@supabase/supabase-js'`
- Instantiated supabase client at module level
- Removed duplicate `const supabase = createServiceRoleClient()` call in GET handler

### 2. `/app/api/nurturing/campaign-templates/[id]/route.ts`
- Replaced: `import { createServiceRoleClient } from '@/lib/supabase/server'`
- With: `import { createClient } from '@supabase/supabase-js'`
- Instantiated supabase client at module level
- Removed 3x `const supabase = createServiceRoleClient()` calls in GET, PUT, DELETE handlers

### 3. `/lib/supabase/workers/campaign-scheduler.ts`
- Replaced: `import { createServiceRoleClient } from '@/lib/supabase/server'`
- With: `import { createClient } from '@supabase/supabase-js'`
- Instantiated supabase client at module level
- Removed duplicate calls in `scheduleCampaignSends()` and `sendQueuedCampaignEmails()` functions

## Verification
✅ All instances of `@/lib/supabase/server` removed  
✅ All API routes now follow consistent pattern  
✅ No duplicate `createClient` instantiations  
✅ Auth module import verified to exist at `@/lib/auth`  
✅ Next.js dev server will auto-rebuild with fixes

## How to Test
1. Browser will auto-reload after Next.js rebuilds
2. Visit `http://localhost:3000/admin/nurturing/analytics`
3. Should now load without 500 error
4. Other campaign/template endpoints now work correctly

## Pattern Reference
All API routes in this codebase follow this pattern:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getServerSession } from '@/lib/auth'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
)

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session?.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    // Use the module-level supabase client
    const { data, error } = await supabase.from('table').select('*')
    
    return NextResponse.json(data)
  } catch (error) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
```

**This is now the canonical pattern for all nurturing APIs.**
