'use client'

import { useEffect, useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Globe, FolderTree, Code, Terminal as TerminalIcon } from 'lucide-react'
import { usePreviewStore } from '@/lib/store/preview-store'
import { useProjectStore } from '@/lib/store/project-store'
import { FileTree } from './file-tree'
import { CodeEditor, getLanguageFromPath } from './code-editor'
import { BrowserPreview } from './browser-preview'
import { Terminal } from './terminal'

export function PreviewPanel() {
  const { activeProject } = useProjectStore()
  const {
    fileTree,
    selectedFile,
    webContainerUrl,
    terminalOutput,
    fetchFiles,
    selectFile,
    clearFiles,
    files,
  } = usePreviewStore()

  const [selectedCode, setSelectedCode] = useState<{ path: string; content: string } | null>(null)

  // Fetch files when project changes
  useEffect(() => {
    if (activeProject) {
      fetchFiles(activeProject.id)
    } else {
      clearFiles()
    }
  }, [activeProject, fetchFiles, clearFiles])

  const handleSelectFile = (path: string, content: string) => {
    setSelectedCode({ path, content })
    const file = files.find((f) => f.path === path)
    if (file) {
      selectFile(file)
    }
  }

  if (!activeProject) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <div className="text-center">
          <Globe className="mx-auto h-12 w-12 mb-2 opacity-50" />
          <p className="text-sm">Select a project</p>
          <p className="text-xs">to see files and preview</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <Tabs defaultValue="preview" className="flex h-full flex-col">
        <div className="border-b border-border px-4">
          <TabsList className="h-12 bg-transparent p-0">
            <TabsTrigger
              value="preview"
              className="data-[state=active]:bg-transparent data-[state=active]:shadow-none"
            >
              <Globe className="mr-2 h-4 w-4" />
              Preview
            </TabsTrigger>
            <TabsTrigger
              value="files"
              className="data-[state=active]:bg-transparent data-[state=active]:shadow-none"
            >
              <FolderTree className="mr-2 h-4 w-4" />
              Files
            </TabsTrigger>
            <TabsTrigger
              value="code"
              className="data-[state=active]:bg-transparent data-[state=active]:shadow-none"
            >
              <Code className="mr-2 h-4 w-4" />
              Code
            </TabsTrigger>
            <TabsTrigger
              value="terminal"
              className="data-[state=active]:bg-transparent data-[state=active]:shadow-none"
            >
              <TerminalIcon className="mr-2 h-4 w-4" />
              Terminal
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="preview" className="flex-1 m-0">
          <BrowserPreview url={webContainerUrl} />
        </TabsContent>

        <TabsContent value="files" className="flex-1 m-0 overflow-hidden">
          <ScrollArea className="h-full">
            {fileTree.length === 0 ? (
              <div className="flex h-full items-center justify-center p-4">
                <div className="text-center text-muted-foreground">
                  <FolderTree className="mx-auto h-12 w-12 mb-2 opacity-50" />
                  <p className="text-sm">No files yet</p>
                  <p className="text-xs">Generated files will appear here</p>
                </div>
              </div>
            ) : (
              <FileTree
                nodes={fileTree}
                onSelectFile={handleSelectFile}
                selectedPath={selectedFile?.path}
              />
            )}
          </ScrollArea>
        </TabsContent>

        <TabsContent value="code" className="flex-1 m-0 overflow-hidden">
          {selectedCode ? (
            <div className="h-full flex flex-col">
              <div className="border-b border-border px-4 py-2">
                <p className="text-sm text-muted-foreground truncate">
                  {selectedCode.path}
                </p>
              </div>
              <div className="flex-1">
                <CodeEditor
                  value={selectedCode.content}
                  language={getLanguageFromPath(selectedCode.path)}
                  readOnly
                />
              </div>
            </div>
          ) : (
            <div className="flex h-full items-center justify-center p-4">
              <div className="text-center text-muted-foreground">
                <Code className="mx-auto h-12 w-12 mb-2 opacity-50" />
                <p className="text-sm">No code selected</p>
                <p className="text-xs">Select a file to view its code</p>
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="terminal" className="flex-1 m-0 p-4">
          {terminalOutput.length > 0 ? (
            <Terminal output={terminalOutput} />
          ) : (
            <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-border bg-muted/50">
              <div className="text-center text-muted-foreground">
                <TerminalIcon className="mx-auto h-12 w-12 mb-2 opacity-50" />
                <p className="text-sm">Terminal inactive</p>
                <p className="text-xs">Terminal output will appear here</p>
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
