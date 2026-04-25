export default function MusicAdminLoading() {
  return (
    <div className="p-6 max-w-7xl mx-auto animate-pulse space-y-6" aria-busy="true" aria-label="Loading music admin">
      <div className="h-9 bg-gray-800 rounded-lg w-48" />
      <div className="h-12 bg-gray-800/60 rounded-lg w-full max-w-xl" />
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <div className="h-40 bg-gray-800/40 rounded-xl border border-gray-800" />
        <div className="h-40 bg-gray-800/40 rounded-xl border border-gray-800" />
        <div className="h-40 bg-gray-800/40 rounded-xl border border-gray-800" />
      </div>
      <div className="h-72 bg-gray-800/30 rounded-xl border border-gray-800" />
    </div>
  )
}
