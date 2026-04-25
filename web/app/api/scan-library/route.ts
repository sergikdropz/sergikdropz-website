import { NextResponse } from 'next/server'
import { exec } from 'child_process'
import { promisify } from 'util'
import { join } from 'path'

const execAsync = promisify(exec)

export async function POST() {
  try {
    const scriptPath = join(process.cwd(), 'scripts', 'scan-music-library.mjs')
    
    // Run the scan script
    const { stdout, stderr } = await execAsync(`node ${scriptPath}`, {
      cwd: process.cwd(),
    })

    if (stderr && !stderr.includes('✅')) {
      console.error('Scan stderr:', stderr)
    }

    return NextResponse.json({
      success: true,
      message: 'Library scanned successfully',
      output: stdout,
    })
  } catch (error: any) {
    console.error('Scan error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to scan library',
      },
      { status: 500 }
    )
  }
}

