'use client'

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Send, MessageSquare } from 'lucide-react'
import { useChatStore } from '@/lib/store/chat-store'
import { useProjectStore } from '@/lib/store/project-store'
import { Message } from './message'

export function ChatPanel() {
  const [input, setInput] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const { messages, isLoading, fetchMessages, sendMessage, clearMessages } = useChatStore()
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
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  const handleSend = async () => {
    if (!input.trim() || !activeProject || isLoading) return

    const content = input.trim()
    setInput('')
    await sendMessage(activeProject.id, content)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  if (!activeProject) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-center text-muted-foreground p-4">
        <MessageSquare className="h-12 w-12 mb-2 opacity-50" />
        <p className="text-sm">Select a project to start chatting</p>
        <p className="text-xs">Create a new project from the sidebar</p>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      {/* Chat Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold">{activeProject.name}</h2>
          <p className="text-xs text-muted-foreground">
            {messages.length} messages
          </p>
        </div>
      </div>

      {/* Messages Area */}
      <ScrollArea className="flex-1" ref={scrollRef}>
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground p-4">
            <MessageSquare className="h-12 w-12 mb-2 opacity-50" />
            <p className="text-sm">No messages yet</p>
            <p className="text-xs">Start a conversation to generate code</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {messages.map((message) => (
              <Message
                key={message.id}
                role={message.role}
                content={message.content}
                isStreaming={message.isStreaming}
              />
            ))}
          </div>
        )}
      </ScrollArea>

      {/* Input Area */}
      <div className="border-t border-border p-4">
        <div className="flex gap-2">
          <Textarea
            ref={textareaRef}
            placeholder="Describe what you want to build..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            className="min-h-[80px] resize-none"
            disabled={isLoading}
          />
          <Button
            size="icon"
            className="shrink-0 self-end"
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
