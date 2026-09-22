import CollabPortalClient from '@/components/collab/CollabPortalClient'

export default function CollabPortalPage({
  params,
}: {
  params: { token: string }
}) {
  return <CollabPortalClient token={params.token} />
}
