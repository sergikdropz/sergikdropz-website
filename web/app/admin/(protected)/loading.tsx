import { SkeletonLines } from '@/components/ui/Skeleton'

export default function AdminLoading() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6 h-7 w-48 animate-pulse rounded-ui bg-surface-muted" />
      <SkeletonLines lines={6} />
    </div>
  )
}
