'use client'

import { AppLayout } from '@/components/layout/app-layout'
import { ProjectSidebar } from '@/components/sidebar/project-sidebar'
import { ChatPanel } from '@/components/chat/chat-panel'
import { PreviewPanel } from '@/components/preview/preview-panel'
import { WelcomePage } from '@/components/welcome-page'
import { useAuthStore } from '@/lib/store/auth-store'
import { useProjectStore } from '@/lib/store/project-store'
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
  const { activeProject } = useProjectStore()

  return (
    <TooltipProvider>
      <AppLayout
        sidebar={<ProjectSidebar />}
        chat={activeProject ? <ChatPanel /> : <WelcomePage />}
        preview={activeProject ? <PreviewPanel /> : null}
        user={user}
        onLogout={logout}
        hasActiveProject={!!activeProject}
      />
    </TooltipProvider>
  )
}
