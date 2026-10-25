import { publicLicenseVerification } from '@/lib/licensing/store'

export const metadata = {
  title: 'Verify a SERGIK license',
  robots: { index: false, follow: false },
}

export default async function LicenseVerifyPage({ params }: { params: { publicId: string } }) {
  let row: Awaited<ReturnType<typeof publicLicenseVerification>> = null
  try {
    row = await publicLicenseVerification(decodeURIComponent(params.publicId))
  } catch {
    row = null
  }
  return (
    <div className="pt-20 min-h-screen">
      <div className="container mx-auto px-4 py-16 max-w-xl">
        <h1 className="text-3xl text-white mb-4">License verification</h1>
        {row ? (
          <dl className="space-y-2 text-gray-200">
            <div>Reference: {row.licenseId}</div>
            <div>Status: {row.status}</div>
            <div>Track: {row.trackTitle}</div>
            <div>Licensee: {row.licensee}</div>
            <div>Usage: {row.usage}</div>
            <div>Territory: {row.territory}</div>
            <div>Term: {row.term}</div>
            <div>Distribution: {row.reach}</div>
            <div>Paid advertising: {row.paidAdvertising ? 'Included in this grant' : 'Not included in this grant'}</div>
            <div>Stems: {row.needsStems ? 'Requested' : 'Not part of this grant'}</div>
          </dl>
        ) : (
          <p className="text-gray-400">No active license matches that reference.</p>
        )}
        <p className="mt-6 text-sm text-gray-500">This page does not show the fee or the contract. The agreement controls the grant.</p>
      </div>
    </div>
  )
}
