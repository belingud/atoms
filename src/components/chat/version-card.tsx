'use client'

import { useState } from 'react'
import { Camera, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
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

interface VersionCardProps {
  version: ProjectVersion
  onRestore: (versionId: string) => Promise<boolean>
}

export function VersionCard({ version, onRestore }: VersionCardProps) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [isRestoring, setIsRestoring] = useState(false)

  const handleRestore = async () => {
    setIsRestoring(true)
    const success = await onRestore(version.id)
    setIsRestoring(false)
    if (success) {
      setDialogOpen(false)
    }
  }

  return (
    <>
      <div className="mx-5 my-2 flex items-center gap-3 rounded-lg border border-emerald-100 bg-emerald-50/80 px-4 py-2.5">
        <Camera className="h-4 w-4 shrink-0 text-emerald-600" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-emerald-900">
              Version {version.version_number}
            </span>
            {version.description && (
              <>
                <span className="text-emerald-300">·</span>
                <span className="text-sm text-emerald-700 truncate">
                  {version.description}
                </span>
              </>
            )}
          </div>
          <p className="text-xs text-emerald-500">{formatTimeAgo(version.created_at)}</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="shrink-0 text-emerald-700 hover:text-emerald-900 hover:bg-emerald-100"
          onClick={() => setDialogOpen(true)}
          disabled={isRestoring}
        >
          <RotateCcw className="h-3.5 w-3.5 mr-1" />
          恢复
        </Button>
      </div>

      <AlertDialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              恢复到 Version {version.version_number}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              这将把所有文件恢复到这个版本的状态。当前的更改将会丢失。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isRestoring}>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleRestore} disabled={isRestoring}>
              <RotateCcw className="mr-2 h-4 w-4" />
              {isRestoring ? '恢复中...' : '恢复'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
