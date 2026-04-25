// Setup page doesn't need authentication check
export const dynamic = 'force-dynamic'

export default function SetupLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <>{children}</>
}
