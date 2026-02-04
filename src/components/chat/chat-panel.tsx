'use client'

import { useEffect, useRef, useState } from 'react'
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
import { Send, MessageSquare, Trash2, X, CheckSquare } from 'lucide-react'
import { useChatStore } from '@/lib/store/chat-store'
import { useProjectStore } from '@/lib/store/project-store'
import { Message } from './message'

export function ChatPanel() {
  const [input, setInput] = useState('')
  const [isComposing, setIsComposing] = useState(false)
  const [isSelectMode, setIsSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const { messages, isLoading, fetchMessages, sendMessage, deleteMessage, deleteMessages, clearHistory, clearMessages } = useChatStore()
  const { activeProject } = useProjectStore()

  // Fetch messages when project changes
  useEffect(() => {
    if (activeProject) {
      fetchMessages(activeProject.id)
    } else {
      clearMessages()
    }
  }, [activeProject, fetchMessages, clearMessages])

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

  const handleSend = async () => {
    if (!input.trim() || !activeProject || isLoading) return

    const content = input.trim()
    setInput('')
    await sendMessage(activeProject.id, content)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
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

  if (!activeProject) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-center text-gray-400 p-4">
        <MessageSquare className="h-12 w-12 mb-2 opacity-50" />
        <p className="text-sm">选择一个项目开始对话</p>
        <p className="text-xs">在侧边栏创建新项目</p>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      {/* Chat Header */}
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 shrink-0 bg-white">
        <div>
          <h2 className="text-sm font-semibold">{activeProject.name}</h2>
          <p className="text-xs text-muted-foreground">
            {messages.length} 条消息
            {isSelectMode && selectedIds.size > 0 && ` · 已选 ${selectedIds.size} 条`}
          </p>
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
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center text-gray-400 p-4">
            <MessageSquare className="h-12 w-12 mb-2 opacity-50" />
            <p className="text-sm">暂无消息</p>
            <p className="text-xs">开始对话来生成代码</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {messages.map((message) => (
              <div key={message.id} className="flex">
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
                    isStreaming={message.isStreaming}
                    toolCalls={message.toolCalls}
                    onDelete={isSelectMode ? undefined : () => deleteMessage(activeProject.id, message.id)}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Input Area */}
      <div className="border-t border-gray-200 p-4 shrink-0 bg-white">
        <div className="flex gap-2">
          <Textarea
            ref={textareaRef}
            placeholder="描述你想要构建的内容..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onCompositionStart={() => setIsComposing(true)}
            onCompositionEnd={() => setIsComposing(false)}
            className="min-h-[80px] resize-none"
            disabled={isLoading}
          />
          <Button
            size="icon"
            className="shrink-0 self-end rounded-full h-9 w-9 bg-gray-900 hover:bg-gray-800"
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
