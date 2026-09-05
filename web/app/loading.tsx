export default function Loading() {
  return (
    <div className="pointer-events-none fixed inset-x-0 top-16 z-20 flex justify-center px-4">
      <div className="h-0.5 w-full max-w-xs overflow-hidden rounded-full bg-white/10">
        <div className="h-full w-1/3 animate-pulse rounded-full bg-white/40" />
      </div>
    </div>
  )
}
