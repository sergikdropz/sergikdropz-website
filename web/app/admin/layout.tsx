/** Root admin segment — auth is enforced in `(protected)/layout` and middleware. */
export default function AdminRootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
