import { create } from 'zustand'
import { createClient } from '@/lib/supabase/client'
import type { File } from '@/lib/types/database'

export interface FileNode {
  name: string
  path: string
  type: 'file' | 'directory'
  content?: string
  children?: FileNode[]
}

interface PreviewState {
  files: File[]
  fileTree: FileNode[]
  selectedFile: File | null
  isLoading: boolean
  webContainerUrl: string | null
  terminalOutput: string[]

  fetchFiles: (projectId: string) => Promise<void>
  saveFile: (projectId: string, path: string, content: string) => Promise<void>
  selectFile: (file: File | null) => void
  setWebContainerUrl: (url: string | null) => void
  addTerminalOutput: (output: string) => void
  clearTerminalOutput: () => void
  clearFiles: () => void
}

function buildFileTree(files: File[]): FileNode[] {
  const root: FileNode[] = []

  for (const file of files) {
    const parts = file.path.split('/')
    let currentLevel = root

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]
      const isFile = i === parts.length - 1
      const existingNode = currentLevel.find((n) => n.name === part)

      if (existingNode) {
        if (!isFile && existingNode.children) {
          currentLevel = existingNode.children
        }
      } else {
        const newNode: FileNode = {
          name: part,
          path: parts.slice(0, i + 1).join('/'),
          type: isFile ? 'file' : 'directory',
          content: isFile ? file.content : undefined,
          children: isFile ? undefined : [],
        }
        currentLevel.push(newNode)
        if (!isFile && newNode.children) {
          currentLevel = newNode.children
        }
      }
    }
  }

  // Sort: directories first, then files, alphabetically
  const sortNodes = (nodes: FileNode[]): FileNode[] => {
    return nodes.sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === 'directory' ? -1 : 1
      }
      return a.name.localeCompare(b.name)
    }).map((node) => ({
      ...node,
      children: node.children ? sortNodes(node.children) : undefined,
    }))
  }

  return sortNodes(root)
}

export const usePreviewStore = create<PreviewState>((set) => ({
  files: [],
  fileTree: [],
  selectedFile: null,
  isLoading: false,
  webContainerUrl: null,
  terminalOutput: [],

  fetchFiles: async (projectId: string) => {
    set({ isLoading: true })
    try {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('files')
        .select('*')
        .eq('project_id', projectId)
        .order('path', { ascending: true })

      if (error) throw error

      const files = data || []
      set({
        files,
        fileTree: buildFileTree(files),
        isLoading: false,
      })
    } catch (error) {
      console.error('Failed to fetch files:', error)
      set({ isLoading: false })
    }
  },

  saveFile: async (projectId: string, path: string, content: string) => {
    try {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('files')
        .upsert(
          { project_id: projectId, path, content },
          { onConflict: 'project_id,path' }
        )
        .select()
        .single()

      if (error) throw error

      set((state) => {
        const existingIndex = state.files.findIndex((f) => f.path === path)
        const files = existingIndex >= 0
          ? state.files.map((f, i) => i === existingIndex ? data : f)
          : [...state.files, data]
        return {
          files,
          fileTree: buildFileTree(files),
        }
      })
    } catch (error) {
      console.error('Failed to save file:', error)
    }
  },

  selectFile: (file) => {
    set({ selectedFile: file })
  },

  setWebContainerUrl: (url) => {
    set({ webContainerUrl: url })
  },

  addTerminalOutput: (output) => {
    set((state) => ({
      terminalOutput: [...state.terminalOutput, output],
    }))
  },

  clearTerminalOutput: () => {
    set({ terminalOutput: [] })
  },

  clearFiles: () => {
    set({
      files: [],
      fileTree: [],
      selectedFile: null,
      webContainerUrl: null,
      terminalOutput: [],
    })
  },
}))

// Helper function to parse files from AI response
export function parseFilesFromResponse(content: string): { path: string; content: string }[] {
  const files: { path: string; content: string }[] = []
  const fileRegex = /```filepath:([^\n]+)\n([\s\S]*?)```/g
  let match

  while ((match = fileRegex.exec(content)) !== null) {
    const path = match[1].trim()
    const fileContent = match[2]
    files.push({ path, content: fileContent })
  }

  return files
}
