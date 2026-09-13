export default function AnalyticsAdminLoading() {
  return (
    <div className="p-6 max-w-7xl mx-auto animate-pulse space-y-6" aria-busy="true" aria-label="Loading analytics">
      <div className="h-9 bg-gray-800 rounded-lg w-56" />
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <div className="h-24 bg-gray-800/50 rounded-xl border border-gray-800" />
        <div className="h-24 bg-gray-800/50 rounded-xl border border-gray-800" />
        <div className="h-24 bg-gray-800/50 rounded-xl border border-gray-800" />
        <div className="h-24 bg-gray-800/50 rounded-xl border border-gray-800" />
      </div>
      <div className="h-80 bg-gray-800/30 rounded-xl border border-gray-800" />
    </div>
  )
}
