'use client'

import { ReactNode, useState } from 'react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from '@/components/ui/sheet'
import { Separator } from '@/components/ui/separator'
import { LogOut, Settings, Menu, PanelLeftClose, PanelLeft } from 'lucide-react'

interface AppLayoutProps {
  sidebar: ReactNode
  chat: ReactNode
  preview: ReactNode | null
  user?: {
    name?: string
    email?: string
    avatarUrl?: string
  }
  onLogout?: () => void
  hasActiveProject?: boolean
}

export function AppLayout({
  sidebar,
  chat,
  preview,
  user,
  onLogout,
  hasActiveProject = false,
}: AppLayoutProps) {
  const [showPreview, setShowPreview] = useState(true)

  const initials = user?.name
    ?.split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase() || user?.email?.[0]?.toUpperCase() || '?'

  return (
    <div className="flex h-screen flex-col bg-background">
      {/* Header */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-gray-200 px-4 bg-white">
        <div className="flex items-center gap-2">
          {/* Mobile sidebar toggle */}
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden h-8 w-8">
                <Menu className="h-4 w-4" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 p-0">
              {sidebar}
            </SheetContent>
          </Sheet>

          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-purple-600 text-white font-bold text-sm">
            A
          </div>
          <span className="text-lg font-semibold text-gray-900">Atoms</span>
        </div>

        <div className="flex items-center gap-2">
          {/* Toggle preview panel */}
          {hasActiveProject && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 hidden lg:flex"
              onClick={() => setShowPreview(!showPreview)}
            >
              {showPreview ? (
                <PanelLeftClose className="h-4 w-4" />
              ) : (
                <PanelLeft className="h-4 w-4" />
              )}
            </Button>
          )}

          {user && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2 rounded-lg p-1 hover:bg-gray-100 transition-colors">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={user.avatarUrl} alt={user.name || 'User'} />
                    <AvatarFallback className="text-xs bg-blue-100 text-blue-600">{initials}</AvatarFallback>
                  </Avatar>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <div className="px-2 py-1.5">
                  <p className="text-sm font-medium">{user.name || 'User'}</p>
                  <p className="text-xs text-muted-foreground">{user.email}</p>
                </div>
                <Separator className="my-1" />
                <DropdownMenuItem>
                  <Settings className="mr-2 h-4 w-4" />
                  设置
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onLogout} className="text-destructive">
                  <LogOut className="mr-2 h-4 w-4" />
                  退出登录
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </header>

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar - hidden on mobile */}
        <aside className="hidden md:block w-64 shrink-0 border-r border-gray-200 bg-gray-50/50 overflow-y-auto">
          {sidebar}
        </aside>

        {/* Main content area */}
        {hasActiveProject ? (
          <>
            {/* Chat Panel */}
            <main className="flex flex-1 flex-col min-w-0 border-r border-gray-200 bg-white">
              {chat}
            </main>

            {/* Preview Panel - hidden on small screens or when toggled off */}
            {showPreview && preview && (
              <aside className="hidden lg:block flex-1 min-w-0 bg-gray-50 overflow-hidden">
                {preview}
              </aside>
            )}
          </>
        ) : (
          /* Welcome page - full width */
          <main className="flex flex-1 flex-col min-w-0 bg-gradient-to-b from-gray-50 to-white">
            {chat}
          </main>
        )}
      </div>
    </div>
  )
}
