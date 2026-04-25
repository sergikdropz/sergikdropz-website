/**
 * Base Agent Class for Sonic DNA Analysis
 * All specialized agents extend this base class
 */

import { AgentType, AgentContext, AgentResult, AgentCapabilities } from './agentTypes'

export abstract class BaseAgent {
  abstract type: AgentType
  abstract capabilities: AgentCapabilities

  /**
   * Process the analysis for this agent
   */
  abstract process(context: AgentContext): Promise<AgentResult>

  /**
   * Process with retry logic and error handling
   */
  async processWithRetry(context: AgentContext, maxRetries: number = 2): Promise<AgentResult> {
    let lastError: Error | null = null
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const result = await this.process(context)
        
        // If successful, return immediately
        if (result.success) {
          return result
        }
        
        // If failed but not retryable, return failure
        if (!this.isRetryableError(result.error || '')) {
          return result
        }
        
        lastError = new Error(result.error || 'Unknown error')
        
        // Wait before retry (exponential backoff)
        if (attempt < maxRetries) {
          const delay = Math.pow(2, attempt) * 1000 // 1s, 2s, 4s
          await new Promise(resolve => setTimeout(resolve, delay))
        }
      } catch (error: any) {
        lastError = error
        
        // Wait before retry
        if (attempt < maxRetries && this.isRetryableError(error.message || '')) {
          const delay = Math.pow(2, attempt) * 1000
          await new Promise(resolve => setTimeout(resolve, delay))
        } else {
          break
        }
      }
    }
    
    return this.createFailure(
      lastError?.message || 'Max retries exceeded',
      Date.now()
    )
  }

  /**
   * Check if error is retryable
   */
  protected isRetryableError(error: string): boolean {
    const retryablePatterns = [
      'timeout',
      'network',
      'rate limit',
      'temporarily',
      '503',
      '502',
      '429',
      'ECONNRESET',
      'ETIMEDOUT'
    ]
    
    const lowerError = error.toLowerCase()
    return retryablePatterns.some(pattern => lowerError.includes(pattern))
  }

  /**
   * Validate that the agent has required data
   */
  public validateContext(context: AgentContext): { valid: boolean; missing: string[] } {
    const missing: string[] = []

    if (this.capabilities.requiresAudioFile && !context.audioFeatures) {
      missing.push('audioFeatures')
    }

    if (this.capabilities.requiresMusicBrainz && !context.musicbrainzData) {
      missing.push('musicbrainzData')
    }

    return {
      valid: missing.length === 0,
      missing
    }
  }

  /**
   * Create a successful result
   */
  protected createSuccess(data: any, confidence: number = 0.8, processingTime: number = 0): AgentResult {
    return {
      agentType: this.type,
      success: true,
      data,
      confidence,
      processingTime,
    }
  }

  /**
   * Create a failed result
   */
  public createFailure(error: string, processingTime: number = 0): AgentResult {
    return {
      agentType: this.type,
      success: false,
      data: null,
      confidence: 0,
      processingTime,
      error
    }
  }

  /**
   * Get agent name for logging
   */
  getName(): string {
    return this.type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
  }

  /**
   * Shared AI call method - uses Claude (Anthropic) with fallback to OpenAI
   * All agents should use this method for consistency
   */
  protected async callAI(prompt: string, maxTokens: number = 2000): Promise<any> {
    const anthropicKey = process.env.ANTHROPIC_API_KEY
    const openaiKey = process.env.OPENAI_API_KEY

    // Try Claude first (preferred)
    if (anthropicKey) {
      try {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': anthropicKey,
            'anthropic-version': '2023-06-01'
          },
          body: JSON.stringify({
            model: 'claude-3-haiku-20240307', // Using Haiku for speed and reliability
            max_tokens: maxTokens,
            messages: [{ role: 'user', content: prompt }]
          })
        })

        if (!response.ok) throw new Error(`Anthropic API error: ${response.statusText}`)
        
        const data = await response.json()
        const content = data.content[0].text
        
        // Extract JSON from response (may include markdown code blocks)
        let jsonText = content.trim()
        
        // Try to extract from code blocks first
        const jsonMatch = jsonText.match(/```json\s*([\s\S]*?)\s*```/) || jsonText.match(/```\s*([\s\S]*?)\s*```/)
        if (jsonMatch) {
          jsonText = jsonMatch[1].trim()
        }
        
        // If the response doesn't start with {, try to find the first { and last }
        if (!jsonText.startsWith('{') && !jsonText.startsWith('[')) {
          const firstBrace = jsonText.indexOf('{')
          const lastBrace = jsonText.lastIndexOf('}')
          if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
            jsonText = jsonText.substring(firstBrace, lastBrace + 1)
          }
        }
        
        try {
          return JSON.parse(jsonText)
        } catch (parseError: any) {
          // Try to clean up common JSON issues
          const cleaned = jsonText
            .replace(/,\s*}/g, '}') // Remove trailing commas
            .replace(/,\s*]/g, ']') // Remove trailing commas in arrays
            .replace(/[\r\n]+/g, ' ') // Replace newlines with spaces
            .replace(/\s+/g, ' ') // Collapse multiple spaces
          
          return JSON.parse(cleaned)
        }
      } catch (error: any) {
        console.warn('Anthropic API failed, trying OpenAI:', error.message)
      }
    }

    // Fallback to OpenAI
    if (openaiKey) {
      try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${openaiKey}`
          },
          body: JSON.stringify({
            model: 'gpt-4-turbo-preview',
            messages: [
              { role: 'system', content: 'Return only valid JSON.' },
              { role: 'user', content: prompt }
            ],
            temperature: 0.8,
            response_format: { type: 'json_object' },
            max_tokens: maxTokens
          })
        })

        if (!response.ok) throw new Error(`OpenAI API error: ${response.statusText}`)
        
        const data = await response.json()
        return JSON.parse(data.choices[0].message.content)
      } catch (error: any) {
        console.warn('OpenAI API also failed:', error.message)
      }
    }

    return null
  }

  /**
   * Apply a user directive to the prompt if provided
   */
  protected withUserDirective(prompt: string, context: AgentContext): string {
    const directive = context.userDirective?.trim()
    if (!directive) return prompt
    return `${prompt}

USER DIRECTION (highest priority unless it conflicts with actual track data):
${directive}

If the direction conflicts with detected audio features, prioritize the data and explain the closest correction.`
  }
}
