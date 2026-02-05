'use client'

import { useEffect, useState, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Plus, MoreHorizontal, Trash2, Folder, ChevronRight, Pencil, Check, X } from 'lucide-react'
import { useProjectStore } from '@/lib/store/project-store'
import { cn } from '@/lib/utils'

export function ProjectSidebar() {
  const {
    projects,
    activeProject,
    isLoading,
    fetchProjects,
    setActiveProject,
    deleteProject,
    renameProject,
  } = useProjectStore()

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetchProjects()
  }, [fetchProjects])

  useEffect(() => {
    if (editingId && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editingId])

  const handleDeleteProject = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (confirm('确定要删除这个项目吗？')) {
      await deleteProject(id)
    }
  }

  const handleStartRename = (id: string, currentName: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setEditingId(id)
    setEditingName(currentName)
  }

  const handleConfirmRename = async () => {
    if (editingId && editingName.trim()) {
      await renameProject(editingId, editingName)
    }
    setEditingId(null)
    setEditingName('')
  }

  const handleCancelRename = () => {
    setEditingId(null)
    setEditingName('')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleConfirmRename()
    } else if (e.key === 'Escape') {
      handleCancelRename()
    }
  }

  // Handle new project button - clear active project to show welcome page
  const handleNewProject = () => {
    setActiveProject(null)
  }

  return (
    <div className="flex h-full flex-col bg-gray-50/80">
      {/* New Project Button */}
      <div className="p-4">
        <Button
          onClick={handleNewProject}
          className={cn(
            "w-full justify-start gap-2 h-11 rounded-xl font-medium shadow-sm",
            !activeProject
              ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:from-blue-700 hover:to-indigo-700 shadow-blue-500/20"
              : "bg-white text-blue-600 hover:bg-blue-50 border border-gray-200/80"
          )}
          variant={!activeProject ? "default" : "outline"}
        >
          <Plus className="h-4 w-4" />
          新项目
        </Button>
      </div>

      {/* Projects Section */}
      <div className="px-4 py-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">我的项目</span>
          <ChevronRight className="h-4 w-4 text-gray-400" />
        </div>
      </div>

      <ScrollArea className="flex-1 px-3">
        {isLoading && projects.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <p className="text-sm text-gray-400">加载中...</p>
          </div>
        ) : projects.length === 0 ? (
          <div className="px-3 py-4">
            <p className="text-sm text-gray-400 text-center">暂无项目</p>
          </div>
        ) : (
          <div className="space-y-1 pb-4">
            {projects.map((project) => (
              <div
                key={project.id}
                className={cn(
                  'group flex items-center justify-between rounded-xl px-3 py-2.5 cursor-pointer transition-all duration-200',
                  activeProject?.id === project.id
                    ? 'bg-white shadow-md shadow-gray-200/50 border border-gray-200/60 text-gray-900'
                    : 'hover:bg-white/70 text-gray-600 hover:shadow-sm'
                )}
                onClick={() => editingId !== project.id && setActiveProject(project)}
              >
                {editingId === project.id ? (
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <Input
                      ref={inputRef}
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      onKeyDown={handleKeyDown}
                      onClick={(e) => e.stopPropagation()}
                      className="h-7 text-sm flex-1"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleConfirmRename()
                      }}
                    >
                      <Check className="h-4 w-4 text-green-600" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleCancelRename()
                      }}
                    >
                      <X className="h-4 w-4 text-gray-400" />
                    </Button>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className={cn(
                        "h-2 w-2 rounded-full",
                        activeProject?.id === project.id ? "bg-blue-500" : "bg-gray-300"
                      )} />
                      <Folder className="h-4 w-4 shrink-0 text-gray-400" />
                      <span className="text-sm font-medium truncate">{project.name}</span>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 opacity-0 group-hover:opacity-100 rounded-lg"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <MoreHorizontal className="h-4 w-4 text-gray-400" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-40">
                        <DropdownMenuItem
                          className="cursor-pointer"
                          onClick={(e) => handleStartRename(project.id, project.name, e)}
                        >
                          <Pencil className="mr-2 h-4 w-4" />
                          重命名
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive cursor-pointer"
                          onClick={(e) => handleDeleteProject(project.id, e)}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          删除
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  )
}
