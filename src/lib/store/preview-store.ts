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

type WebContainerStatus = 'idle' | 'booting' | 'installing' | 'running' | 'ready' | 'error'

export interface PendingCommand {
  id: string
  command: string
  resolve: (output: string) => void
  reject: (error: Error) => void
}

interface PreviewState {
  files: File[]
  fileTree: FileNode[]
  selectedFile: File | null
  isLoading: boolean
  webContainerUrl: string | null
  webContainerStatus: WebContainerStatus
  terminalOutput: string[]
  pendingRunPreview: boolean
  pendingCommands: PendingCommand[]

  fetchFiles: (projectId: string) => Promise<void>
  saveFile: (projectId: string, path: string, content: string) => Promise<void>
  selectFile: (file: File | null) => void
  setWebContainerUrl: (url: string | null) => void
  setWebContainerStatus: (status: WebContainerStatus) => void
  addTerminalOutput: (output: string) => void
  clearTerminalOutput: () => void
  clearFiles: () => void
  triggerRunPreview: () => void
  clearPendingRunPreview: () => void
  stopPreview: () => void
  queueCommand: (command: string) => Promise<string>
  getNextCommand: () => PendingCommand | undefined
  resolveCommand: (id: string, output: string) => void
  rejectCommand: (id: string, error: Error) => void

  // File operation helpers
  getFileContent: (path: string) => string | null
  listDirectory: (path: string) => { name: string; type: 'file' | 'directory' }[]
  searchFiles: (pattern: string) => string[]
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

export const usePreviewStore = create<PreviewState>((set, get) => ({
  files: [],
  fileTree: [],
  selectedFile: null,
  isLoading: false,
  webContainerUrl: null,
  webContainerStatus: 'idle',
  terminalOutput: [],
  pendingRunPreview: false,
  pendingCommands: [],

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

  setWebContainerStatus: (status) => {
    set({ webContainerStatus: status })
  },

  addTerminalOutput: (output) => {
    set((state) => {
      // Split output by newlines and filter empty
      const newLines = output.split('\n').filter(line => line.trim().length > 0)

      if (newLines.length === 0) {
        return state
      }

      // Check if this looks like a progress update (contains \r or specific patterns)
      const isProgressUpdate = output.includes('\r') ||
        /^\s*[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/.test(output) ||  // Spinner characters
        /^\s*[-\\|/]/.test(output.trim())  // Simple spinners

      if (isProgressUpdate && state.terminalOutput.length > 0) {
        // Replace the last line with the latest progress
        const lastLine = newLines[newLines.length - 1]
        return {
          terminalOutput: [...state.terminalOutput.slice(0, -1), lastLine],
        }
      }

      return {
        terminalOutput: [...state.terminalOutput, ...newLines],
      }
    })
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
      webContainerStatus: 'idle',
      terminalOutput: [],
      pendingRunPreview: false,
      pendingCommands: [],
    })
  },

  triggerRunPreview: () => {
    set({ pendingRunPreview: true })
  },

  clearPendingRunPreview: () => {
    set({ pendingRunPreview: false })
  },

  stopPreview: () => {
    set({
      webContainerUrl: null,
      webContainerStatus: 'idle',
    })
    get().addTerminalOutput('Preview stopped.')
  },

  queueCommand: (command: string) => {
    return new Promise((resolve, reject) => {
      const id = crypto.randomUUID()
      const COMMAND_TIMEOUT = 300_000 // 5 minutes

      const timer = setTimeout(() => {
        const cmd = get().pendingCommands.find(c => c.id === id)
        if (cmd) {
          set((state) => ({
            pendingCommands: state.pendingCommands.filter(c => c.id !== id),
          }))
          resolve(`Command timed out after ${COMMAND_TIMEOUT / 1000}s: ${command}`)
        }
      }, COMMAND_TIMEOUT)

      const wrappedResolve = (output: string) => {
        clearTimeout(timer)
        resolve(output)
      }
      const wrappedReject = (error: Error) => {
        clearTimeout(timer)
        reject(error)
      }

      set((state) => ({
        pendingCommands: [...state.pendingCommands, { id, command, resolve: wrappedResolve, reject: wrappedReject }],
      }))
    })
  },

  getNextCommand: () => {
    return get().pendingCommands[0]
  },

  resolveCommand: (id: string, output: string) => {
    const command = get().pendingCommands.find(c => c.id === id)
    if (command) {
      command.resolve(output)
      set((state) => ({
        pendingCommands: state.pendingCommands.filter(c => c.id !== id),
      }))
    }
  },

  rejectCommand: (id: string, error: Error) => {
    const command = get().pendingCommands.find(c => c.id === id)
    if (command) {
      command.reject(error)
      set((state) => ({
        pendingCommands: state.pendingCommands.filter(c => c.id !== id),
      }))
    }
  },

  // File operation helpers - synchronous, using current state
  getFileContent: (path: string) => {
    const file = get().files.find(f => f.path === path)
    return file?.content ?? null
  },

  listDirectory: (path: string) => {
    const files = get().files
    const normalizedPath = path.replace(/^\/+|\/+$/g, '') // Remove leading/trailing slashes
    const results: { name: string; type: 'file' | 'directory' }[] = []
    const seen = new Set<string>()

    for (const file of files) {
      const filePath = file.path.replace(/^\/+/, '')

      // Check if file is in the target directory
      if (normalizedPath === '') {
        // Root directory - get first part of path
        const firstPart = filePath.split('/')[0]
        if (!seen.has(firstPart)) {
          seen.add(firstPart)
          const isDir = filePath.includes('/')
          results.push({ name: firstPart, type: isDir ? 'directory' : 'file' })
        }
      } else if (filePath.startsWith(normalizedPath + '/')) {
        // Subdirectory
        const remaining = filePath.slice(normalizedPath.length + 1)
        const firstPart = remaining.split('/')[0]
        if (!seen.has(firstPart)) {
          seen.add(firstPart)
          const isDir = remaining.includes('/')
          results.push({ name: firstPart, type: isDir ? 'directory' : 'file' })
        }
      }
    }

    return results.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'directory' ? -1 : 1
      return a.name.localeCompare(b.name)
    })
  },

  searchFiles: (pattern: string) => {
    const files = get().files
    const lowerPattern = pattern.toLowerCase()
    return files
      .filter(f => f.path.toLowerCase().includes(lowerPattern))
      .map(f => f.path)
  },
}))

// Helper function to parse files from AI response
// Supports multiple formats:
// 1. ```filepath:/path/to/file.tsx
// 2. ```typescript:src/file.tsx  (language:path)
// 3. ```tsx title="src/file.tsx"
// 4. ```tsx filename="src/file.tsx"
export function parseFilesFromResponse(content: string): { path: string; content: string }[] {
  const files: { path: string; content: string }[] = []

  // Pattern 1: ```filepath:/path/to/file
  const filepathRegex = /```filepath:([^\n]+)\n([\s\S]*?)```/g
  let match
  while ((match = filepathRegex.exec(content)) !== null) {
    const path = match[1].trim()
    const fileContent = match[2].trimEnd()
    if (path && fileContent) {
      files.push({ path, content: fileContent })
    }
  }

  // Pattern 2: ```language:path (e.g., ```typescript:src/index.ts)
  const langPathRegex = /```\w+:([^\s\n]+)\n([\s\S]*?)```/g
  while ((match = langPathRegex.exec(content)) !== null) {
    const path = match[1].trim()
    const fileContent = match[2].trimEnd()
    // Avoid duplicates and avoid matching filepath: again
    if (path && fileContent && !files.some(f => f.path === path) && !path.startsWith('filepath')) {
      files.push({ path, content: fileContent })
    }
  }

  // Pattern 3: ```tsx title="path" or filename="path"
  const attrRegex = /```\w*\s+(?:title|filename)=["']([^"']+)["']\n([\s\S]*?)```/g
  while ((match = attrRegex.exec(content)) !== null) {
    const path = match[1].trim()
    const fileContent = match[2].trimEnd()
    if (path && fileContent && !files.some(f => f.path === path)) {
      files.push({ path, content: fileContent })
    }
  }

  return files
}
