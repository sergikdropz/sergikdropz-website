import LicensingDesk from './LicensingDesk'

export const metadata = {
  title: 'SERGIK licensing desk',
  robots: { index: false, follow: false },
}

export default function LicensingDeskPage({
  params,
  searchParams,
}: {
  params: { token: string }
  searchParams?: { payment?: string }
}) {
  return (
    <div className="pt-20 min-h-screen">
      <div className="container mx-auto px-4 py-16 max-w-2xl">
        <LicensingDesk token={params.token} payment={searchParams?.payment} />
      </div>
    </div>
  )
}
