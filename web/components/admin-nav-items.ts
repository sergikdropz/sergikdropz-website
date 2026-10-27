type AdminNavLink = {
  type: 'link'
  label: string
  href: string
}

type AdminNavGroup = {
  type: 'group'
  label: string
  items: AdminNavLink[]
}

export type AdminNavItem = AdminNavLink | AdminNavGroup

export const adminNavItems: AdminNavItem[] = [
  { type: 'link', label: 'Dashboard', href: '/admin' },
  {
    type: 'group',
    label: 'Release Studio',
    items: [
      { type: 'link', label: 'Home', href: '/studio' },
      { type: 'link', label: 'Releases', href: '/studio/releases' },
      { type: 'link', label: 'Create', href: '/studio/create' },
      { type: 'link', label: 'Pipeline', href: '/studio/pipeline' },
      { type: 'link', label: 'Collab Hub', href: '/studio/collab' },
    ],
  },
  {
    type: 'group',
    label: 'Music',
    items: [
      { type: 'link', label: 'Browse', href: '/admin/music-vault?view=browse' },
      { type: 'link', label: 'Vault', href: '/admin/music-vault' },
    ],
  },
  { type: 'link', label: 'Videos', href: '/admin/videos-manager' },
  { type: 'link', label: 'Gallery', href: '/admin/gallery' },
  { type: 'link', label: 'Merch Design Studio', href: '/admin/merch' },
  {
    type: 'group',
    label: 'Shop',
    items: [
      { type: 'link', label: 'Purchases', href: '/admin/purchases' },
      { type: 'link', label: 'Live shop', href: '/shop' },
      { type: 'link', label: 'Products', href: '/admin/purchasable-tracks' },
      { type: 'link', label: 'Licenses', href: '/admin/licenses' },
      { type: 'link', label: 'Sync licensing', href: '/admin/licensing' },
      { type: 'link', label: 'Bundles', href: '/admin/bundles' },
      { type: 'link', label: 'Memberships', href: '/admin/memberships' },
      { type: 'link', label: 'Splits', href: '/admin/splits' },
      { type: 'link', label: 'Subscribers', href: '/admin/subscribers' },
    ],
  },
  {
    type: 'group',
    label: 'Tools',
    items: [
      { type: 'link', label: 'Analytics', href: '/admin/analytics' },
      { type: 'link', label: 'Department mail', href: '/admin/email' },
      { type: 'link', label: 'Smart Links', href: '/admin/nurturing/smart-links' },
      { type: 'link', label: 'Campaigns', href: '/admin/nurturing/campaigns' },
      { type: 'link', label: 'Templates', href: '/admin/nurturing/templates' },
    ],
  },
  {
    type: 'group',
    label: 'Nurturing',
    items: [
      { type: 'link', label: 'Analytics', href: '/admin/nurturing/analytics' },
      { type: 'link', label: 'Fans', href: '/admin/nurturing/fans' },
      { type: 'link', label: 'Fan journey simulator', href: '/admin/tools/fan-journey' },
      { type: 'link', label: 'Segments', href: '/admin/nurturing/segments' },
    ],
  },
  {
    type: 'group',
    label: 'Settings',
    items: [
      { type: 'link', label: 'General', href: '/admin/settings' },
      { type: 'link', label: 'Users', href: '/admin/users' },
      { type: 'link', label: 'Database', href: '/admin/database' },
      { type: 'link', label: 'Logs', href: '/admin/logs' },
    ],
  },
]
