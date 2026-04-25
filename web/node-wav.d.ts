declare module 'node-wav' {
  export function decode(buffer: Buffer): {
    sampleRate: number
    channelData: Float32Array[]
  }
}
