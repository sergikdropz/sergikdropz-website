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
  { type: 'link', label: 'Music Vault', href: '/admin/music-vault' },
  { type: 'link', label: 'Music (Legacy)', href: '/admin/music' },
  { type: 'link', label: 'Gallery', href: '/admin/gallery' },
  { type: 'link', label: 'Videos', href: '/admin/videos-manager' },
  { type: 'link', label: 'Purchases', href: '/admin/purchases' },
  {
    type: 'group',
    label: 'Shop',
    items: [
      { type: 'link', label: 'Products', href: '/admin/purchasable-tracks' },
      { type: 'link', label: 'Licenses', href: '/admin/licenses' },
      { type: 'link', label: 'Bundles', href: '/admin/bundles' },
      { type: 'link', label: 'Memberships', href: '/admin/memberships' },
      { type: 'link', label: 'Merch', href: '/admin/merch' },
      { type: 'link', label: 'Splits', href: '/admin/splits' },
      { type: 'link', label: 'Subscribers', href: '/admin/subscribers' },
    ],
  },
  { type: 'link', label: 'Analytics', href: '/admin/analytics' },
  {
    type: 'group',
    label: 'Tools',
    items: [{ type: 'link', label: 'Fan journey simulator', href: '/admin/tools/fan-journey' }],
  },
  {
    type: 'group',
    label: 'Nurturing',
    items: [
      { type: 'link', label: 'Smart Links', href: '/admin/nurturing/smart-links' },
      { type: 'link', label: 'Fans', href: '/admin/nurturing/fans' },
      { type: 'link', label: 'Segments', href: '/admin/nurturing/segments' },
      { type: 'link', label: 'Campaigns', href: '/admin/nurturing/campaigns' },
      { type: 'link', label: 'Templates', href: '/admin/nurturing/templates' },
      { type: 'link', label: 'Analytics', href: '/admin/nurturing/analytics' },
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
  { type: 'link', label: 'Release Studio', href: '/studio' },
]
