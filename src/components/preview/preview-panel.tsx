'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Globe, FolderTree, Code, Terminal as TerminalIcon, Play, Square, Loader2, AlertCircle } from 'lucide-react'
import { usePreviewStore } from '@/lib/store/preview-store'
import { useProjectStore } from '@/lib/store/project-store'
import { FileTree } from './file-tree'
import { CodeEditor, getLanguageFromPath } from './code-editor'
import { BrowserPreview } from './browser-preview'
import { Terminal } from './terminal'
import { VersionHistory } from './version-history'
import {
  getWebContainer,
  isWebContainerSupported,
  filesToFileSystemTree,
  ensurePackageJson,
  teardownWebContainer,
} from '@/lib/webcontainer'
import type { WebContainer } from '@webcontainer/api'

export function PreviewPanel() {
  const { activeProject } = useProjectStore()
  const {
    files,
    fileTree,
    selectedFile,
    webContainerUrl,
    webContainerStatus,
    terminalOutput,
    pendingRunPreview,
    pendingCommands,
    fetchFiles,
    selectFile,
    clearFiles,
    setWebContainerUrl,
    setWebContainerStatus,
    addTerminalOutput,
    clearTerminalOutput,
    clearPendingRunPreview,
    stopPreview,
    getNextCommand,
    resolveCommand,
    rejectCommand,
  } = usePreviewStore()

  const [selectedCode, setSelectedCode] = useState<{ path: string; content: string } | null>(null)
  const [isSupported, setIsSupported] = useState(true)
  const webContainerRef = useRef<WebContainer | null>(null)

  // Check WebContainer support
  useEffect(() => {
    setIsSupported(isWebContainerSupported())
  }, [])

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

  const runPreview = useCallback(async () => {
    if (files.length === 0) {
      addTerminalOutput('No files to run. Generate some code first.')
      return
    }

    try {
      clearTerminalOutput()
      setWebContainerUrl(null)
      setWebContainerStatus('booting')
      addTerminalOutput('Preparing WebContainer...')

      // Teardown existing instance to avoid conflicts
      await teardownWebContainer()
      webContainerRef.current = null

      const webcontainer = await getWebContainer()
      webContainerRef.current = webcontainer
      addTerminalOutput('WebContainer booted successfully.')

      // Convert files to WebContainer file system tree
      const fileList = files.map((f) => ({ path: f.path, content: f.content }))

      addTerminalOutput(`Mounting ${fileList.length} files...`)

      let fsTree = filesToFileSystemTree(fileList)
      fsTree = ensurePackageJson(fsTree, activeProject?.name || 'my-app')

      await webcontainer.mount(fsTree)
      addTerminalOutput('Files mounted.')

      // Run npm install
      setWebContainerStatus('installing')
      addTerminalOutput('Installing dependencies (npm install)...')
      const installProcess = await webcontainer.spawn('npm', ['install'])

      installProcess.output.pipeTo(
        new WritableStream({
          write(data) {
            addTerminalOutput(data)
          },
        })
      )

      const installExitCode = await installProcess.exit
      if (installExitCode !== 0) {
        setWebContainerStatus('error')
        addTerminalOutput(`npm install failed with exit code ${installExitCode}`)
        return
      }

      addTerminalOutput('Dependencies installed.')
      setWebContainerStatus('running')
      addTerminalOutput('Starting dev server (npm run dev)...')

      const devProcess = await webcontainer.spawn('npm', ['run', 'dev'])

      devProcess.output.pipeTo(
        new WritableStream({
          write(data) {
            addTerminalOutput(data)
          },
        })
      )

      // Listen for server-ready event
      webcontainer.on('server-ready', (port, url) => {
        addTerminalOutput(`Server ready at ${url}`)
        setWebContainerUrl(url)
        setWebContainerStatus('ready')
      })
    } catch (error) {
      console.error('WebContainer error:', error)
      setWebContainerStatus('error')
      addTerminalOutput(`Error: ${(error as Error).message}`)
    }
  }, [
    files,
    activeProject,
    addTerminalOutput,
    clearTerminalOutput,
    setWebContainerStatus,
    setWebContainerUrl,
  ])

  const handleStopPreview = useCallback(async () => {
    await teardownWebContainer()
    webContainerRef.current = null
    stopPreview()
  }, [stopPreview])

  // Execute a command in WebContainer with timeout
  const executeCommand = useCallback(async (command: string): Promise<string> => {
    let webcontainer = webContainerRef.current

    // If no WebContainer instance, boot one
    if (!webcontainer) {
      addTerminalOutput('Booting WebContainer for command execution...')
      webcontainer = await getWebContainer()
      webContainerRef.current = webcontainer

      // Mount current files
      if (files.length > 0) {
        const fileList = files.map((f) => ({ path: f.path, content: f.content }))
        let fsTree = filesToFileSystemTree(fileList)
        fsTree = ensurePackageJson(fsTree, activeProject?.name || 'my-app')
        await webcontainer.mount(fsTree)
      }
    }

    addTerminalOutput(`$ ${command}`)

    // Parse command into program and args
    const parts = command.split(' ')
    const program = parts[0]
    const args = parts.slice(1)

    const EXEC_TIMEOUT = 300_000 // 5 minutes
    let output = ''
    const process = await webcontainer.spawn(program, args)

    // Race between command completion and timeout
    const outputPromise = (async () => {
      await process.output.pipeTo(
        new WritableStream({
          write(data) {
            output += data
            addTerminalOutput(data)
          },
        })
      )

      const exitCode = await process.exit
      if (exitCode !== 0) {
        output += `\nProcess exited with code ${exitCode}`
      }
      return output
    })()

    const timeoutPromise = new Promise<string>((resolve) => {
      setTimeout(() => {
        try { process.kill() } catch { /* ignore */ }
        addTerminalOutput(`\nCommand timed out after ${EXEC_TIMEOUT / 1000}s, killed.`)
        resolve(output + `\nCommand timed out after ${EXEC_TIMEOUT / 1000}s`)
      }, EXEC_TIMEOUT)
    })

    return Promise.race([outputPromise, timeoutPromise])
  }, [files, activeProject, addTerminalOutput])

  // Watch for pending run preview from AI
  useEffect(() => {
    if (pendingRunPreview && isSupported && files.length > 0) {
      clearPendingRunPreview()
      runPreview()
    }
  }, [pendingRunPreview, isSupported, files.length, clearPendingRunPreview, runPreview])

  // Watch for pending commands from AI
  useEffect(() => {
    const processCommands = async () => {
      const pendingCommand = getNextCommand()
      if (pendingCommand && isSupported) {
        try {
          const output = await executeCommand(pendingCommand.command)
          resolveCommand(pendingCommand.id, output)
        } catch (error) {
          rejectCommand(pendingCommand.id, error as Error)
        }
      }
    }
    processCommands()
  }, [pendingCommands, isSupported, getNextCommand, resolveCommand, rejectCommand, executeCommand])

  if (!activeProject) {
    return (
      <div className="flex h-full items-center justify-center text-gray-400">
        <div className="text-center">
          <Globe className="mx-auto h-12 w-12 mb-2 opacity-50" />
          <p className="text-sm">选择一个项目</p>
          <p className="text-xs">查看文件和预览</p>
        </div>
      </div>
    )
  }

  const statusText = {
    idle: '运行预览',
    booting: '启动中...',
    installing: '安装中...',
    running: '启动中...',
    ready: '运行中',
    error: '错误',
  }

  const isRunning = ['booting', 'installing', 'running'].includes(webContainerStatus)

  return (
    <div className="flex h-full flex-col">
      <Tabs defaultValue="preview" className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b border-gray-200 px-4">
          <TabsList className="h-12 bg-transparent p-0">
            <TabsTrigger
              value="preview"
              className="data-[state=active]:bg-transparent data-[state=active]:shadow-none"
            >
              <Globe className="mr-2 h-4 w-4" />
              预览
            </TabsTrigger>
            <TabsTrigger
              value="files"
              className="data-[state=active]:bg-transparent data-[state=active]:shadow-none"
            >
              <FolderTree className="mr-2 h-4 w-4" />
              文件
            </TabsTrigger>
            <TabsTrigger
              value="code"
              className="data-[state=active]:bg-transparent data-[state=active]:shadow-none"
            >
              <Code className="mr-2 h-4 w-4" />
              代码
            </TabsTrigger>
            <TabsTrigger
              value="terminal"
              className="data-[state=active]:bg-transparent data-[state=active]:shadow-none"
            >
              <TerminalIcon className="mr-2 h-4 w-4" />
              终端
            </TabsTrigger>
          </TabsList>

          {/* Version history and Run/Stop buttons */}
          {files.length > 0 && isSupported && (
            <div className="flex gap-2">
              <VersionHistory />
              {(webContainerStatus === 'ready' || webContainerStatus === 'running') && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleStopPreview}
                  className="gap-2"
                >
                  <Square className="h-3 w-3 fill-current" />
                  停止
                </Button>
              )}
              <Button
                size="sm"
                onClick={runPreview}
                disabled={isRunning}
                className="gap-2"
              >
                {isRunning ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : webContainerStatus === 'error' ? (
                  <AlertCircle className="h-4 w-4" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
                {statusText[webContainerStatus]}
              </Button>
            </div>
          )}
        </div>

        <TabsContent value="preview" className="flex-1 m-0">
          {!isSupported ? (
            <div className="flex h-full items-center justify-center p-4">
              <div className="text-center text-gray-400 max-w-md">
                <AlertCircle className="mx-auto h-12 w-12 mb-2 opacity-50" />
                <p className="text-sm font-medium">浏览器不支持 WebContainer</p>
                <p className="text-xs mt-1">
                  你的浏览器不支持 SharedArrayBuffer。请使用 Chrome 或 Edge 浏览器。
                </p>
              </div>
            </div>
          ) : (
            <BrowserPreview url={webContainerUrl} />
          )}
        </TabsContent>

        <TabsContent value="files" className="flex-1 m-0 overflow-hidden">
          <ScrollArea className="h-full">
            {fileTree.length === 0 ? (
            <div className="flex h-full items-center justify-center p-4">
              <div className="text-center text-gray-400">
                <FolderTree className="mx-auto h-12 w-12 mb-2 opacity-50" />
                <p className="text-sm">暂无文件</p>
                <p className="text-xs">生成的文件将显示在这里</p>
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
              <div className="border-b border-gray-200 px-4 py-2 shrink-0">
                <p className="text-sm text-muted-foreground truncate">
                  {selectedCode.path}
                </p>
              </div>
              <div className="flex-1 min-h-0">
                <CodeEditor
                  value={selectedCode.content}
                  language={getLanguageFromPath(selectedCode.path)}
                  readOnly
                />
              </div>
            </div>
          ) : (
            <div className="flex h-full items-center justify-center p-4">
              <div className="text-center text-gray-400">
                <Code className="mx-auto h-12 w-12 mb-2 opacity-50" />
                <p className="text-sm">未选择代码</p>
                <p className="text-xs">选择一个文件查看代码</p>
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="terminal" className="flex-1 m-0 p-4 overflow-hidden">
          {terminalOutput.length > 0 ? (
            <Terminal output={terminalOutput} />
          ) : (
            <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-gray-200 bg-gray-50/50">
              <div className="text-center text-gray-400">
                <TerminalIcon className="mx-auto h-12 w-12 mb-2 opacity-50" />
                <p className="text-sm">终端未激活</p>
                <p className="text-xs">点击"运行预览"启动</p>
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
