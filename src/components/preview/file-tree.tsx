'use client'

import { ChevronRight, ChevronDown, File, Folder } from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import type { FileNode } from '@/lib/store/preview-store'

interface FileTreeProps {
  nodes: FileNode[]
  onSelectFile: (path: string, content: string) => void
  selectedPath?: string
}

interface TreeNodeProps {
  node: FileNode
  depth: number
  onSelectFile: (path: string, content: string) => void
  selectedPath?: string
}

function TreeNode({ node, depth, onSelectFile, selectedPath }: TreeNodeProps) {
  const [isExpanded, setIsExpanded] = useState(true)
  const isDirectory = node.type === 'directory'
  const isSelected = selectedPath === node.path

  const handleClick = () => {
    if (isDirectory) {
      setIsExpanded(!isExpanded)
    } else if (node.content !== undefined) {
      onSelectFile(node.path, node.content)
    }
  }

  return (
    <div>
      <div
        className={cn(
          'flex items-center gap-1 px-2 py-1 cursor-pointer hover:bg-accent/50 rounded text-sm',
          isSelected && 'bg-accent text-accent-foreground'
        )}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
        onClick={handleClick}
      >
        {isDirectory ? (
          <>
            {isExpanded ? (
              <ChevronDown className="h-4 w-4 shrink-0" />
            ) : (
              <ChevronRight className="h-4 w-4 shrink-0" />
            )}
            <Folder className="h-4 w-4 shrink-0 text-yellow-500" />
          </>
        ) : (
          <>
            <span className="w-4" />
            <File className="h-4 w-4 shrink-0 text-muted-foreground" />
          </>
        )}
        <span className="truncate">{node.name}</span>
      </div>
      {isDirectory && isExpanded && node.children && (
        <div>
          {node.children.map((child) => (
            <TreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              onSelectFile={onSelectFile}
              selectedPath={selectedPath}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export function FileTree({ nodes, onSelectFile, selectedPath }: FileTreeProps) {
  if (nodes.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        No files yet
      </div>
    )
  }

  return (
    <div className="py-2">
      {nodes.map((node) => (
        <TreeNode
          key={node.path}
          node={node}
          depth={0}
          onSelectFile={onSelectFile}
          selectedPath={selectedPath}
        />
      ))}
    </div>
  )
}
