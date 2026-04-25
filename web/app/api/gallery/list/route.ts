import { NextResponse } from 'next/server'
import { readdir } from 'fs/promises'
import { join } from 'path'
import { existsSync } from 'fs'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const galleryDir = join(process.cwd(), 'web', 'public', 'images', 'gallery')
    
    if (!existsSync(galleryDir)) {
      return NextResponse.json({ images: [] })
    }

    const files = await readdir(galleryDir)
    const imageFiles = files.filter((file) =>
      /\.(jpg|jpeg|png|gif|webp)$/i.test(file)
    )

    const images = imageFiles.map((filename) => ({
      id: filename,
      filename,
      url: `/images/gallery/${filename}`,
    }))

    return NextResponse.json({ images })
  } catch (error: any) {
    console.error('List error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    )
  }
}
