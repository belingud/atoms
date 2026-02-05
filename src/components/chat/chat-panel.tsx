'use client'

import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Send, Square, MessageSquare, Trash2, X, CheckSquare } from 'lucide-react'
import { useChatStore } from '@/lib/store/chat-store'
import { useProjectStore } from '@/lib/store/project-store'
import { useVersionStore } from '@/lib/store/version-store'
import { Message } from './message'
import { VersionCard } from './version-card'
import { MentionAutocomplete } from './mention-autocomplete'
import { getPartialMention, completeMention } from '@/lib/utils/mention-parser'
import { cn } from '@/lib/utils'
import type { AgentId } from '@/lib/types/agent'

export function ChatPanel() {
  const [input, setInput] = useState('')
  const [isComposing, setIsComposing] = useState(false)
  const [isSelectMode, setIsSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [showMentionMenu, setShowMentionMenu] = useState(false)
  const [mentionPartial, setMentionPartial] = useState('')
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const { messages, messagesProjectId, isLoading, isFetchingMessages, fetchMessages, sendMessage, stopGeneration, deleteMessage, deleteMessages, clearHistory, clearMessages } = useChatStore()
  const { activeProject } = useProjectStore()
  const { versions, fetchVersions, restoreVersion } = useVersionStore()
  // Fetch messages when project changes, but only if messages don't already belong to this project
  useEffect(() => {
    if (activeProject) {
      // Only fetch if the store's messages are for a different project and we're not mid-fetch
      if (messagesProjectId !== activeProject.id && !isFetchingMessages) {
        fetchMessages(activeProject.id)
      }
    } else {
      clearMessages()
    }
  }, [activeProject, messagesProjectId, isFetchingMessages, fetchMessages, clearMessages])

  // Fetch versions when project changes
  useEffect(() => {
    if (activeProject) {
      fetchVersions(activeProject.id)
    }
  }, [activeProject, fetchVersions])

  // Refresh versions when conversation ends (isLoading transitions from true to false)
  const prevLoadingRef = useRef(isLoading)
  useEffect(() => {
    if (prevLoadingRef.current && !isLoading && activeProject) {
      fetchVersions(activeProject.id)
    }
    prevLoadingRef.current = isLoading
  }, [isLoading, activeProject, fetchVersions])

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight
    }
  }, [messages])

  // Exit select mode when messages change significantly
  useEffect(() => {
    if (isSelectMode) {
      setSelectedIds(new Set())
    }
  }, [messages.length])

  // ESC key to stop generation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isLoading) {
        e.preventDefault()
        stopGeneration()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isLoading, stopGeneration])

  // Check for @mention trigger on input change
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value
    setInput(value)

    const cursorPos = e.target.selectionStart || 0
    const partial = getPartialMention(value, cursorPos)

    if (partial !== null) {
      setMentionPartial(partial)
      setShowMentionMenu(true)
    } else {
      setShowMentionMenu(false)
    }
  }, [])

  // Handle @mention selection
  const handleMentionSelect = useCallback((agentId: AgentId) => {
    const cursorPos = textareaRef.current?.selectionStart || input.length
    const { text, newCursorPosition } = completeMention(input, cursorPos, agentId)
    setInput(text)
    setShowMentionMenu(false)

    // Set cursor position after React re-renders
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus()
        textareaRef.current.setSelectionRange(newCursorPosition, newCursorPosition)
      }
    }, 0)
  }, [input])

  const handleSend = async () => {
    if (!input.trim() || !activeProject || isLoading) return

    const content = input.trim()
    setInput('')
    setShowMentionMenu(false)
    await sendMessage(activeProject.id, content)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Let mention autocomplete handle these keys when open
    if (showMentionMenu && ['ArrowDown', 'ArrowUp', 'Enter', 'Tab', 'Escape'].includes(e.key)) {
      return
    }

    // Don't send if composing (e.g., typing Chinese with IME)
    if (e.key === 'Enter' && !e.shiftKey && !isComposing) {
      e.preventDefault()
      handleSend()
    }
  }

  const toggleSelect = (id: string) => {
    const newSet = new Set(selectedIds)
    if (newSet.has(id)) {
      newSet.delete(id)
    } else {
      newSet.add(id)
    }
    setSelectedIds(newSet)
  }

  const selectAll = () => {
    setSelectedIds(new Set(messages.map(m => m.id)))
  }

  const handleDeleteSelected = async () => {
    if (!activeProject || selectedIds.size === 0) return
    await deleteMessages(activeProject.id, Array.from(selectedIds))
    setSelectedIds(new Set())
    setIsSelectMode(false)
  }

  const exitSelectMode = () => {
    setIsSelectMode(false)
    setSelectedIds(new Set())
  }

  // Get version for a specific message
  const getVersionForMessage = useCallback((messageId: string) => {
    return versions.find(v => v.message_id === messageId)
  }, [versions])

  // Get versions that don't match any message (message_id is null or message was deleted)
  const unmatchedVersions = useMemo(() => {
    const matchedMessageIds = new Set(
      versions
        .filter(v => v.message_id && messages.some(m => m.id === v.message_id))
        .map(v => v.id)
    )
    return versions
      .filter(v => !matchedMessageIds.has(v.id))
      .sort((a, b) => a.version_number - b.version_number)
  }, [versions, messages])

  // Handle version restore
  const handleRestoreVersion = useCallback(async (versionId: string) => {
    if (!activeProject) return false
    return await restoreVersion(activeProject.id, versionId)
  }, [activeProject, restoreVersion])

  if (!activeProject) {
    return null
  }

  return (
    <div className="flex h-full flex-col">
      {/* Chat Header */}
      <div className="flex items-center justify-between border-b border-gray-200/80 px-5 py-3 shrink-0 bg-white/80 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <div className={cn(
            "h-2.5 w-2.5 rounded-full",
            isLoading ? "bg-amber-400 animate-pulse" : "bg-emerald-500"
          )} />
          <div>
            <h2 className="text-sm font-semibold text-gray-900">{activeProject.name}</h2>
            <p className="text-xs text-gray-500">
              {messages.length} 条消息
              {isSelectMode && selectedIds.size > 0 && <span className="text-blue-600 font-medium"> · 已选 {selectedIds.size} 条</span>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {isSelectMode ? (
            <>
              <Button variant="ghost" size="sm" onClick={selectAll} className="text-muted-foreground">
                全选
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive"
                    disabled={selectedIds.size === 0}
                  >
                    <Trash2 className="h-4 w-4 mr-1" />
                    删除 ({selectedIds.size})
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>删除所选消息</AlertDialogTitle>
                    <AlertDialogDescription>
                      确定要删除选中的 {selectedIds.size} 条消息吗？此操作无法撤销。
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>取消</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDeleteSelected}>
                      确定删除
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
              <Button variant="ghost" size="icon" onClick={exitSelectMode} className="h-8 w-8">
                <X className="h-4 w-4" />
              </Button>
            </>
          ) : (
            messages.length > 0 && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsSelectMode(true)}
                  className="text-muted-foreground"
                >
                  <CheckSquare className="h-4 w-4 mr-1" />
                  选择
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="sm" className="text-muted-foreground">
                      <Trash2 className="h-4 w-4 mr-1" />
                      清空
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>清空聊天记录</AlertDialogTitle>
                      <AlertDialogDescription>
                        确定要删除所有聊天记录吗？此操作无法撤销。
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>取消</AlertDialogCancel>
                      <AlertDialogAction onClick={() => clearHistory(activeProject.id)}>
                        确定
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </>
            )
          )}
        </div>
      </div>

      {/* Messages Area - using native scrolling */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto"
      >
        {messages.length === 0 && unmatchedVersions.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center text-gray-400 p-4">
            <MessageSquare className="h-12 w-12 mb-2 opacity-50" />
            <p className="text-sm">暂无消息</p>
            <p className="text-xs">输入 @ 选择 Agent，或直接开始对话</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {messages.map((message) => {
              const version = getVersionForMessage(message.id)
              return (
                <div key={message.id}>
                  <div className="flex">
                    {isSelectMode && (
                      <div className="flex items-start pt-4 pl-3">
                        <Checkbox
                          checked={selectedIds.has(message.id)}
                          onCheckedChange={() => toggleSelect(message.id)}
                        />
                      </div>
                    )}
                    <div className="flex-1">
                      <Message
                        role={message.role}
                        content={message.content}
                        thinking={message.thinking}
                        agentId={message.agentId}
                        isStreaming={message.isStreaming}
                        toolCalls={message.toolCalls}
                        onDelete={isSelectMode ? undefined : () => deleteMessage(activeProject.id, message.id)}
                      />
                    </div>
                  </div>
                  {version && (
                    <VersionCard
                      version={version}
                      onRestore={handleRestoreVersion}
                    />
                  )}
                </div>
              )
            })}
            {/* Show versions that don't have a matching message (orphaned versions) */}
            {unmatchedVersions.map((version) => (
              <VersionCard
                key={`orphan-version-${version.id}`}
                version={version}
                onRestore={handleRestoreVersion}
              />
            ))}
          </div>
        )}
      </div>

      {/* Input Area */}
      <div className="border-t border-gray-200/80 p-4 shrink-0 bg-white">
        <div className="flex gap-3 relative">
          {/* Mention Autocomplete */}
          {showMentionMenu && (
            <MentionAutocomplete
              partial={mentionPartial}
              onSelect={handleMentionSelect}
              onClose={() => setShowMentionMenu(false)}
            />
          )}

          <Textarea
            ref={textareaRef}
            placeholder="输入 @ 选择 Agent，或直接描述任务..."
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onCompositionStart={() => setIsComposing(true)}
            onCompositionEnd={() => setIsComposing(false)}
            className="min-h-[90px] resize-none rounded-xl border-gray-200/80 focus:border-blue-300 focus:ring-2 focus:ring-blue-100 transition-all"
            disabled={isLoading}
          />
          {isLoading ? (
            <Button
              size="icon"
              variant="outline"
              className="shrink-0 self-end rounded-full h-10 w-10 border-red-200 text-red-500 hover:bg-red-50 hover:text-red-600 hover:border-red-300 shadow-sm"
              onClick={stopGeneration}
              title="停止生成 (Esc)"
            >
              <Square className="h-3.5 w-3.5 fill-current" />
            </Button>
          ) : (
            <Button
              size="icon"
              className="shrink-0 self-end rounded-full h-10 w-10 bg-gradient-to-r from-gray-900 to-gray-800 hover:from-gray-800 hover:to-gray-700 shadow-md shadow-gray-900/20 hover:shadow-lg hover:shadow-gray-900/30 transition-all duration-200"
              onClick={handleSend}
              disabled={!input.trim()}
            >
              <Send className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
