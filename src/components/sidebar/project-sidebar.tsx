'use client'

import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Plus, MoreHorizontal, Trash2, Folder, ChevronRight } from 'lucide-react'
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
  } = useProjectStore()

  useEffect(() => {
    fetchProjects()
  }, [fetchProjects])

  const handleDeleteProject = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (confirm('确定要删除这个项目吗？')) {
      await deleteProject(id)
    }
  }

  // Handle new project button - clear active project to show welcome page
  const handleNewProject = () => {
    setActiveProject(null)
  }

  return (
    <div className="flex h-full flex-col bg-gray-50/50">
      {/* New Project Button */}
      <div className="p-3">
        <Button
          onClick={handleNewProject}
          className={cn(
            "w-full justify-start gap-2 border-0",
            !activeProject
              ? "bg-blue-100 text-blue-700 hover:bg-blue-200"
              : "bg-blue-50 text-blue-600 hover:bg-blue-100"
          )}
          variant="outline"
        >
          <Plus className="h-4 w-4" />
          新项目
        </Button>
      </div>

      {/* Projects Section */}
      <div className="px-4 py-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-gray-700">我的项目</span>
          <ChevronRight className="h-4 w-4 text-gray-400" />
        </div>
      </div>

      <ScrollArea className="flex-1 px-2">
        {isLoading && projects.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <p className="text-sm text-gray-400">加载中...</p>
          </div>
        ) : projects.length === 0 ? (
          <div className="px-3 py-2">
            <p className="text-sm text-gray-400">暂无项目</p>
          </div>
        ) : (
          <div className="space-y-1 pb-4">
            {projects.map((project) => (
              <div
                key={project.id}
                className={cn(
                  'group flex items-center justify-between rounded-lg px-3 py-2 cursor-pointer transition-colors',
                  activeProject?.id === project.id
                    ? 'bg-white shadow-sm border border-gray-200 text-gray-900'
                    : 'hover:bg-white/60 text-gray-600'
                )}
                onClick={() => setActiveProject(project)}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Folder className="h-4 w-4 shrink-0" />
                  <span className="text-sm truncate">{project.name}</span>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 opacity-0 group-hover:opacity-100"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      className="text-destructive"
                      onClick={(e) => handleDeleteProject(project.id, e)}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      删除
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  )
}
