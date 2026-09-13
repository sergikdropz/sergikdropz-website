/**
 * PDF Export API for Sonic DNA Reports
 */

import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    const data = await request.json()
    const { track, metrics, sonicDNA } = data

    // Generate PDF content as HTML (can be converted to PDF client-side or server-side)
    const htmlContent = generatePDFHTML(track, metrics, sonicDNA)

    // For now, return HTML that can be printed to PDF
    // In production, you might want to use a library like puppeteer or pdfkit
    return new NextResponse(htmlContent, {
      headers: {
        'Content-Type': 'text/html',
        'Content-Disposition': `attachment; filename="${track.title || 'track'}-sonic-dna.html"`,
      },
    })
  } catch (error: any) {
    console.error('PDF export error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

function generatePDFHTML(track: any, metrics: any, sonicDNA: any): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Sonic DNA Report - ${track.title}</title>
  <style>
    @media print {
      @page { margin: 1cm; }
      body { margin: 0; }
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 800px;
      margin: 0 auto;
      padding: 20px;
      background: white;
    }
    .header {
      border-bottom: 3px solid #9333ea;
      padding-bottom: 20px;
      margin-bottom: 30px;
    }
    .header h1 {
      color: #9333ea;
      margin: 0;
      font-size: 28px;
    }
    .header .subtitle {
      color: #666;
      margin-top: 5px;
    }
    .metrics {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 15px;
      margin-bottom: 30px;
    }
    .metric-card {
      background: #f9fafb;
      padding: 15px;
      border-radius: 8px;
      border-left: 4px solid #9333ea;
    }
    .metric-label {
      font-size: 12px;
      color: #666;
      text-transform: uppercase;
      margin-bottom: 5px;
    }
    .metric-value {
      font-size: 24px;
      font-weight: bold;
      color: #9333ea;
    }
    .section {
      margin-bottom: 30px;
      page-break-inside: avoid;
    }
    .section-title {
      font-size: 20px;
      color: #9333ea;
      border-bottom: 2px solid #e5e7eb;
      padding-bottom: 10px;
      margin-bottom: 15px;
    }
    .field {
      margin-bottom: 15px;
    }
    .field-label {
      font-weight: 600;
      color: #555;
      margin-bottom: 5px;
      font-size: 14px;
    }
    .field-value {
      color: #333;
      white-space: pre-wrap;
      line-height: 1.6;
    }
    .array-item {
      background: #f3f4f6;
      padding: 8px 12px;
      margin: 5px 0;
      border-radius: 4px;
      display: inline-block;
    }
    .footer {
      margin-top: 50px;
      padding-top: 20px;
      border-top: 1px solid #e5e7eb;
      text-align: center;
      color: #666;
      font-size: 12px;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>Sonic DNA Analysis Report</h1>
    <div class="subtitle">
      <strong>${track.title}</strong> by ${track.artist}
    </div>
    <div class="subtitle">
      BPM: ${track.bpm} | Key: ${track.key} | Genre: ${track.genre}
    </div>
  </div>

  <div class="metrics">
    <div class="metric-card">
      <div class="metric-label">Completeness</div>
      <div class="metric-value">${metrics.completeness}%</div>
      <div style="font-size: 12px; color: #666; margin-top: 5px;">
        ${metrics.filled} of ${metrics.total} fields filled
      </div>
    </div>
    <div class="metric-card">
      <div class="metric-label">Quality Score</div>
      <div class="metric-value">${metrics.qualityScore}%</div>
    </div>
  </div>

  ${generateSection('Description', sonicDNA.description)}
  ${generateSection('Intention', sonicDNA.intention)}
  ${generateSection('Summary', sonicDNA.summary)}
  
  ${generateEmotionalSection(sonicDNA.emotional)}
  ${generateMusicalSection(sonicDNA.musical)}
  ${generateTechnicalSection(sonicDNA.technical)}
  ${generateDrumsSection(sonicDNA.drums)}
  ${generateHarmonySection(sonicDNA.harmony)}
  ${generateGenresSection(sonicDNA.genres)}
  ${generateHistoricalSection(sonicDNA.historical)}
  ${generateRegionalSection(sonicDNA.regional)}
  ${generateCulturalSection(sonicDNA.cultural)}
  ${generateMusicologySection(sonicDNA.musicology)}

  <div class="footer">
    Generated on ${new Date().toLocaleString()}<br>
    SERGIK Sonic DNA Analyzer
  </div>
</body>
</html>`
}

function generateSection(title: string, content: any): string {
  if (!content) return ''
  return `
  <div class="section">
    <div class="section-title">${title}</div>
    <div class="field">
      <div class="field-value">${escapeHtml(String(content))}</div>
    </div>
  </div>`
}

function generateEmotionalSection(emotional: any): string {
  if (!emotional) return ''
  let html = '<div class="section"><div class="section-title">Emotional Analysis</div>'
  
  if (emotional.primaryEmotions?.length > 0) {
    html += '<div class="field"><div class="field-label">Primary Emotions</div>'
    html += emotional.primaryEmotions.map((e: string) => `<span class="array-item">${escapeHtml(e)}</span>`).join('')
    html += '</div>'
  }
  
  if (emotional.emotionalJourney) {
    html += generateField('Emotional Journey', emotional.emotionalJourney)
  }
  
  if (emotional.psychologicalProfile) {
    html += generateField('Psychological Profile', emotional.psychologicalProfile)
  }
  
  html += '</div>'
  return html
}

function generateMusicalSection(musical: any): string {
  if (!musical) return ''
  let html = '<div class="section"><div class="section-title">Musical Analysis</div>'
  
  if (musical.keySignature) html += generateField('Key Signature', musical.keySignature)
  if (musical.timeSignature) html += generateField('Time Signature', musical.timeSignature)
  if (musical.scale) html += generateField('Scale', musical.scale)
  if (musical.harmonicComplexity) html += generateField('Harmonic Complexity', musical.harmonicComplexity)
  if (musical.rhythmicPatterns) html += generateField('Rhythmic Patterns', musical.rhythmicPatterns)
  if (musical.instrumentation?.length > 0) {
    html += '<div class="field"><div class="field-label">Instrumentation</div>'
    html += musical.instrumentation.map((i: string) => `<span class="array-item">${escapeHtml(i)}</span>`).join('')
    html += '</div>'
  }
  
  html += '</div>'
  return html
}

function generateTechnicalSection(technical: any): string {
  if (!technical) return ''
  let html = '<div class="section"><div class="section-title">Technical Analysis</div>'
  
  if (technical.bpm) html += generateField('BPM', technical.bpm)
  if (technical.energyLevel) html += generateField('Energy Level', `${(technical.energyLevel * 100).toFixed(0)}%`)
  if (technical.danceability) html += generateField('Danceability', `${(technical.danceability * 100).toFixed(0)}%`)
  if (technical.technicalDescription) html += generateField('Technical Description', technical.technicalDescription)
  
  html += '</div>'
  return html
}

function generateDrumsSection(drums: any): string {
  if (!drums) return ''
  let html = '<div class="section"><div class="section-title">Drum Pattern Analysis</div>'
  
  if (drums.patternType) html += generateField('Pattern Type', drums.patternType)
  if (drums.kickPattern) html += generateField('Kick Pattern', drums.kickPattern)
  if (drums.snarePattern) html += generateField('Snare Pattern', drums.snarePattern)
  if (drums.hihatPattern) html += generateField('Hi-Hat Pattern', drums.hihatPattern)
  if (drums.patternRecognition) html += generateField('Pattern Recognition', drums.patternRecognition)
  
  html += '</div>'
  return html
}

function generateHarmonySection(harmony: any): string {
  if (!harmony) return ''
  let html = '<div class="section"><div class="section-title">Harmony Analysis</div>'
  
  if (harmony.keySignature) html += generateField('Key Signature', harmony.keySignature)
  if (harmony.harmonicComplexity) html += generateField('Harmonic Complexity', harmony.harmonicComplexity)
  
  html += '</div>'
  return html
}

function generateGenresSection(genres: any): string {
  if (!genres) return ''
  let html = '<div class="section"><div class="section-title">Genre Analysis</div>'
  
  if (genres.primaryGenres?.length > 0) {
    html += '<div class="field"><div class="field-label">Primary Genres</div>'
    html += genres.primaryGenres.map((g: string) => `<span class="array-item">${escapeHtml(g)}</span>`).join('')
    html += '</div>'
  }
  
  if (genres.genreFusion) html += generateField('Genre Fusion', genres.genreFusion)
  if (genres.genreEvolution) html += generateField('Genre Evolution', genres.genreEvolution)
  
  html += '</div>'
  return html
}

function generateHistoricalSection(historical: any): string {
  if (!historical) return ''
  let html = '<div class="section"><div class="section-title">Historical Context</div>'
  
  if (historical.historicalContext) html += generateField('Historical Context', historical.historicalContext)
  if (historical.eraInfluences?.length > 0) {
    html += '<div class="field"><div class="field-label">Era Influences</div>'
    html += historical.eraInfluences.map((e: string) => `<span class="array-item">${escapeHtml(e)}</span>`).join('')
    html += '</div>'
  }
  
  html += '</div>'
  return html
}

function generateRegionalSection(regional: any): string {
  if (!regional) return ''
  let html = '<div class="section"><div class="section-title">Regional Analysis</div>'
  
  if (regional.regionalCharacteristics) html += generateField('Regional Characteristics', regional.regionalCharacteristics)
  if (regional.primaryRegions?.length > 0) {
    html += '<div class="field"><div class="field-label">Primary Regions</div>'
    html += regional.primaryRegions.map((r: string) => `<span class="array-item">${escapeHtml(r)}</span>`).join('')
    html += '</div>'
  }
  
  html += '</div>'
  return html
}

function generateCulturalSection(cultural: any): string {
  if (!cultural) return ''
  let html = '<div class="section"><div class="section-title">Cultural Analysis</div>'
  
  if (cultural.description) html += generateField('Description', cultural.description)
  if (cultural.regionalCharacteristics) html += generateField('Regional Characteristics', cultural.regionalCharacteristics)
  
  html += '</div>'
  return html
}

function generateMusicologySection(musicology: any): string {
  if (!musicology) return ''
  let html = '<div class="section"><div class="section-title">Musicology Analysis</div>'
  
  if (musicology.description) html += generateField('Description', musicology.description)
  
  html += '</div>'
  return html
}

function generateField(label: string, value: any): string {
  if (!value) return ''
  return `
    <div class="field">
      <div class="field-label">${escapeHtml(label)}</div>
      <div class="field-value">${escapeHtml(String(value))}</div>
    </div>`
}

function escapeHtml(text: string): string {
  const div = { innerHTML: text } as any
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}
