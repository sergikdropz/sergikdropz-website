import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase'

/**
 * POST /api/music-library/folders/move
 * Move a folder to a new parent (or root)
 * Body: { folderId, newParentId? }
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = createSupabaseServerClient()
    const body = await request.json()

    const { folderId, newParentId } = body

    if (!folderId) {
      return NextResponse.json(
        { error: 'folderId is required' },
        { status: 400 }
      )
    }

    // Prevent moving folder into itself
    if (folderId === newParentId) {
      return NextResponse.json(
        { error: 'Cannot move folder into itself' },
        { status: 400 }
      )
    }

    // Check if newParentId would create a circular reference
    if (newParentId) {
      // Get all descendants of folderId
      const { data: descendants } = await supabase
        .from('music_library_folders')
        .select('id')
        .eq('parent_id', folderId)

      // Recursively check all descendants
      const checkDescendants = async (parentId: string): Promise<string[]> => {
        const { data: children } = await supabase
          .from('music_library_folders')
          .select('id')
          .eq('parent_id', parentId)

        if (!children || children.length === 0) return [parentId]

        const allDescendants = [parentId]
        for (const child of children) {
          const childDescendants = await checkDescendants(child.id)
          allDescendants.push(...childDescendants)
        }
        return allDescendants
      }

      const allDescendants = await checkDescendants(folderId)
      if (allDescendants.includes(newParentId)) {
        return NextResponse.json(
          { error: 'Cannot move folder into its own descendant' },
          { status: 400 }
        )
      }
    }

    // Update the folder's parent
    const { data, error } = await supabase
      .from('music_library_folders')
      .update({ parent_id: newParentId || null })
      .eq('id', folderId)
      .select()
      .single()

    if (error) {
      console.error('Error moving folder:', error)
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({ folder: data })
  } catch (error: any) {
    console.error('Error in POST /api/music-library/folders/move:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to move folder' },
      { status: 500 }
    )
  }
}
