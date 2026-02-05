'use client'

import { useEffect, useState } from 'react'
import { History, ChevronDown, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useVersionStore } from '@/lib/store/version-store'
import { useProjectStore } from '@/lib/store/project-store'
import type { ProjectVersion } from '@/lib/types/database'

function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffSec = Math.floor(diffMs / 1000)
  const diffMin = Math.floor(diffSec / 60)
  const diffHour = Math.floor(diffMin / 60)
  const diffDay = Math.floor(diffHour / 24)

  if (diffSec < 60) return '刚刚'
  if (diffMin < 60) return `${diffMin} 分钟前`
  if (diffHour < 24) return `${diffHour} 小时前`
  if (diffDay < 7) return `${diffDay} 天前`
  return date.toLocaleDateString('zh-CN')
}

export function VersionHistory() {
  const { activeProject } = useProjectStore()
  const { versions, currentVersionNumber, isLoading, fetchVersions, restoreVersion } = useVersionStore()
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false)
  const [selectedVersion, setSelectedVersion] = useState<ProjectVersion | null>(null)

  useEffect(() => {
    if (activeProject) {
      fetchVersions(activeProject.id)
    }
  }, [activeProject, fetchVersions])

  const handleRestoreClick = (version: ProjectVersion) => {
    setSelectedVersion(version)
    setRestoreDialogOpen(true)
  }

  const handleConfirmRestore = async () => {
    if (!activeProject || !selectedVersion) return

    const success = await restoreVersion(activeProject.id, selectedVersion.id)
    if (success) {
      setRestoreDialogOpen(false)
      setSelectedVersion(null)
    }
  }

  if (!activeProject || versions.length === 0) {
    return null
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2" disabled={isLoading}>
            <History className="h-4 w-4" />
            <span>v{currentVersionNumber}</span>
            <ChevronDown className="h-3 w-3 opacity-50" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72">
          <DropdownMenuLabel>版本历史</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {versions.map((version) => (
            <DropdownMenuItem
              key={version.id}
              className="flex flex-col items-start gap-1 py-2 cursor-pointer"
              onClick={() => handleRestoreClick(version)}
            >
              <div className="flex w-full items-center justify-between">
                <span className="font-medium">v{version.version_number}</span>
                <span className="text-xs text-muted-foreground">
                  {formatTimeAgo(version.created_at)}
                </span>
              </div>
              {version.description && (
                <span className="text-xs text-muted-foreground line-clamp-1">
                  {version.description}
                </span>
              )}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={restoreDialogOpen} onOpenChange={setRestoreDialogOpen}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>
              恢复到版本 v{selectedVersion?.version_number}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              这将把所有文件恢复到这个版本的状态。当前的更改将会丢失。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmRestore}>
              <RotateCcw className="mr-2 h-4 w-4" />
              恢复
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
