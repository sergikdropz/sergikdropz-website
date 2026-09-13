import type { Metadata } from 'next'
import AdminAiAssistant from '@/components/AdminAiAssistant'

export const metadata: Metadata = {
  title: 'Admin AI Assistant',
  description: 'SERGIK admin AI chat in a separate window',
}

export default function AdminAiAssistantWindowPage() {
  return <AdminAiAssistant presentation="standaloneWindow" />
}
