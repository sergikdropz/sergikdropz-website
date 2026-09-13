import { formatSonicDnaProse } from '@/lib/audio/sonic-dna-prose'

type Props = {
  text: string
  className?: string
  headingClassName?: string
  simple?: boolean
}

export default function DnaReadableCopy({ text, className = '', headingClassName = '', simple = false }: Props) {
  const blocks = formatSonicDnaProse(text)
  const visible = simple
    ? blocks.filter((block) => block.type !== 'heading').slice(0, 3)
    : blocks
  if (!visible.length) return null
  return (
    <div className={`space-y-3 ${className}`}>
      {visible.map((block, index) => {
        if (block.type === 'heading') {
          return (
            <h4
              key={`${block.text}-${index}`}
              className={`text-[11px] font-semibold uppercase tracking-wide text-white/50 ${headingClassName}`}
            >
              {block.text}
            </h4>
          )
        }
        if (block.type === 'list') {
          return (
            <ul key={`list-${index}`} className="list-disc space-y-1.5 pl-4">
              {block.items.map((item) => (
                <li key={item} className="leading-relaxed">
                  {item}
                </li>
              ))}
            </ul>
          )
        }
        return (
          <p key={`p-${index}`} className="leading-relaxed">
            {block.text}
          </p>
        )
      })}
    </div>
  )
}
