import {
  croweCreativeCredits,
  croweCreativeGenerateImage,
  croweCreativeGenerateVideo,
  croweCreativeListModels,
  croweCreativeQuote,
  resolveCroweCreativeEnv,
  sanitizeCroweCreativePayload,
} from '@/lib/ai/crowe-creative-client'

export type CroweCreativeAction =
  | 'models'
  | 'credits'
  | 'quote'
  | 'generate_image'
  | 'generate_video'

export async function runCroweCreativeTool(params: {
  action: CroweCreativeAction
  prompt?: string
  model?: string
  kind?: 'video' | 'image'
  seconds?: number
  resolution?: string
  aspect_ratio?: string
  count?: number
  dryRun?: boolean
}) {
  const env = resolveCroweCreativeEnv()
  const action = params.action

  if (action === 'models') {
    const res = await croweCreativeListModels()
    return { action, env: { configured: env.configured, baseUrl: env.baseUrl, keySource: env.keySource }, ...res }
  }

  if (action === 'credits') {
    const res = await croweCreativeCredits()
    return { action, env: { configured: env.configured, baseUrl: env.baseUrl, keySource: env.keySource }, ...res }
  }

  if (action === 'quote') {
    const kind = params.kind === 'image' ? 'image' : 'video'
    const model = (params.model || (kind === 'video' ? 'seedance' : 'nano-banana')).trim()
    const res = await croweCreativeQuote({
      kind,
      model,
      seconds: params.seconds,
      resolution: params.resolution,
      count: params.count,
    })
    return { action, kind, model, ...res }
  }

  const prompt = (params.prompt || '').trim()
  if (!prompt) throw new Error('prompt is required for generate_image / generate_video')

  const model =
    (params.model || (action === 'generate_video' ? 'seedance' : 'nano-banana')).trim()

  if (params.dryRun) {
    const kind = action === 'generate_video' ? 'video' : 'image'
    const quote = await croweCreativeQuote({
      kind,
      model,
      seconds: params.seconds,
      resolution: params.resolution,
      count: params.count,
    })
    return {
      action,
      dryRun: true,
      wouldRun: {
        prompt: prompt.slice(0, 2000),
        model,
        seconds: params.seconds ?? 5,
        resolution: params.resolution ?? '720P',
        aspect_ratio: params.aspect_ratio ?? '16:9',
        count: params.count ?? 1,
      },
      quote: quote.data,
      quoteOk: quote.ok,
      hint: 'Approve to charge Crowe Creative credits and run generation.',
    }
  }

  if (action === 'generate_image') {
    const res = await croweCreativeGenerateImage(prompt, model, params.count ?? 1)
    return {
      action,
      ok: res.ok,
      status: res.status,
      data: sanitizeCroweCreativePayload(res.data),
      error: res.error,
    }
  }

  const res = await croweCreativeGenerateVideo({
    prompt,
    model,
    seconds: params.seconds,
    resolution: params.resolution,
    aspect_ratio: params.aspect_ratio,
  })
  return {
    action,
    ok: res.ok,
    status: res.status,
    data: sanitizeCroweCreativePayload(res.data),
    error: res.error,
  }
}
