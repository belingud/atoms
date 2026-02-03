'use client'

import { AppLayout } from '@/components/layout/app-layout'
import { ProjectSidebar } from '@/components/sidebar/project-sidebar'
import { ChatPanel } from '@/components/chat/chat-panel'
import { PreviewPanel } from '@/components/preview/preview-panel'
import { useAuthStore } from '@/lib/store/auth-store'
import { TooltipProvider } from '@/components/ui/tooltip'

interface MainAppProps {
  user: {
    name?: string
    email?: string
    avatarUrl?: string
  }
}

export function MainApp({ user }: MainAppProps) {
  const logout = useAuthStore((state) => state.logout)

  return (
    <TooltipProvider>
      <AppLayout
        sidebar={<ProjectSidebar />}
        chat={<ChatPanel />}
        preview={<PreviewPanel />}
        user={user}
        onLogout={logout}
      />
    </TooltipProvider>
  )
}
