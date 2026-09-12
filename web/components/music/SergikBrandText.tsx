import { splitSergikBrandText } from '@/lib/ui/sergik-brand-text'

/**
 * Render text with SERGIK brand letters (S E R G I K) in Six Caps —
 * slightly larger and twice as wide as surrounding text.
 */
export function SergikBrandText({
  text,
  className,
}: {
  text: string
  className?: string
}) {
  const chunks = splitSergikBrandText(text)
  if (!chunks.length) return null

  return (
    <span className={className}>
      {chunks.map((chunk, index) =>
        chunk.brand
          ? chunk.text.split('').map((letter, letterIndex) => (
              <span key={`${index}-${letterIndex}`} className="font-sergik-brand-letter">
                {letter}
              </span>
            ))
          : (
              <span key={index}>{chunk.text}</span>
            ),
      )}
    </span>
  )
}
