'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { User, Bot, Loader2, Play, FileCode, CheckCircle2, Circle, AlertCircle, FolderOpen, Search, Terminal as TerminalIcon, ChevronDown, ChevronRight, Trash2, Users, Brain } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { ToolCall } from '@/lib/store/chat-store'
import { AgentBadge, AgentAvatar } from './agent-badge'

interface MessageProps {
  role: 'user' | 'assistant'
  content: string
  thinking?: string
  agentId?: string
  isStreaming?: boolean
  toolCalls?: ToolCall[]
  onDelete?: () => void
}

// Tool display configuration
const TOOL_CONFIG: Record<string, { icon: React.ReactNode; label: string }> = {
  write_file: { icon: <FileCode className="h-3.5 w-3.5" />, label: '写入文件' },
  read_file: { icon: <FileCode className="h-3.5 w-3.5" />, label: '读取文件' },
  list_directory: { icon: <FolderOpen className="h-3.5 w-3.5" />, label: '列出目录' },
  search_files: { icon: <Search className="h-3.5 w-3.5" />, label: '搜索文件' },
  run_command: { icon: <TerminalIcon className="h-3.5 w-3.5" />, label: '执行命令' },
  run_preview: { icon: <Play className="h-3.5 w-3.5" />, label: '启动预览' },
  delegate_task: { icon: <Users className="h-3.5 w-3.5" />, label: '委派任务' },
}

// Status icons
const STATUS_ICONS: Record<string, React.ReactNode> = {
  pending: <Circle className="h-3 w-3 text-muted-foreground" />,
  running: <Loader2 className="h-3 w-3 animate-spin text-blue-500" />,
  completed: <CheckCircle2 className="h-3 w-3 text-green-500" />,
  error: <AlertCircle className="h-3 w-3 text-red-500" />,
}

function ToolCallItem({ toolCall }: { toolCall: ToolCall }) {
  const [isExpanded, setIsExpanded] = useState(false)
  const config = TOOL_CONFIG[toolCall.name] || {
    icon: <Circle className="h-3.5 w-3.5" />,
    label: toolCall.name
  }
  const statusIcon = STATUS_ICONS[toolCall.status]

  // Get relevant argument to display
  const displayArg = (() => {
    const args = toolCall.arguments as Record<string, unknown>
    if (toolCall.name === 'write_file' || toolCall.name === 'read_file') {
      return args.path as string
    }
    if (toolCall.name === 'list_directory') {
      return (args.path as string) || '/'
    }
    if (toolCall.name === 'search_files') {
      return args.pattern as string
    }
    if (toolCall.name === 'run_command') {
      return args.command as string
    }
    if (toolCall.name === 'delegate_task') {
      const task = (args.task as string)?.substring(0, 40) || ''
      return `→ ${args.agent_id}: ${task}${task.length >= 40 ? '...' : ''}`
    }
    return null
  })()

  const hasResult = toolCall.result && toolCall.status === 'completed'

  return (
    <div className="rounded-md bg-gray-100 overflow-hidden">
      <div
        className={cn(
          "flex items-center gap-2 px-3 py-1.5 text-sm",
          hasResult && "cursor-pointer hover:bg-gray-200/70"
        )}
        onClick={() => hasResult && setIsExpanded(!isExpanded)}
      >
        {hasResult && (
          <span className="text-muted-foreground">
            {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          </span>
        )}
        <span className="text-muted-foreground">{config.icon}</span>
        <span className="font-medium">{config.label}</span>
        {displayArg && (
          <span className="text-muted-foreground text-xs font-mono truncate max-w-[200px]">
            {displayArg}
          </span>
        )}
        <span className="ml-auto">{statusIcon}</span>
      </div>
      {isExpanded && toolCall.result && (
        <div className="px-3 py-2 border-t border-gray-200/50 bg-white/50">
          <pre className="text-xs text-muted-foreground whitespace-pre-wrap break-all max-h-[200px] overflow-y-auto">
            {toolCall.result}
          </pre>
        </div>
      )}
    </div>
  )
}

export function Message({ role, content, thinking, agentId, isStreaming, toolCalls, onDelete }: MessageProps) {
  const isUser = role === 'user'
  const [isHovered, setIsHovered] = useState(false)
  const [isThinkingExpanded, setIsThinkingExpanded] = useState(false)

  return (
    <div
      className={cn(
        'flex gap-3 px-5 py-5 relative group',
        isUser ? 'bg-white hover:bg-gray-50/50' : 'bg-slate-50/80 hover:bg-slate-100/50',
        'transition-colors duration-200'
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {isUser ? (
        <Avatar className="h-9 w-9 shrink-0 ring-2 ring-white shadow-sm">
          <AvatarFallback className="text-xs bg-gradient-to-br from-gray-700 to-gray-900 text-white">
            <User className="h-4 w-4" />
          </AvatarFallback>
        </Avatar>
      ) : agentId ? (
        <AgentAvatar agentId={agentId} />
      ) : (
        <Avatar className="h-9 w-9 shrink-0 ring-2 ring-white shadow-sm">
          <AvatarFallback className="text-xs bg-gradient-to-br from-blue-100 to-indigo-100 text-blue-600">
            <Bot className="h-4 w-4" />
          </AvatarFallback>
        </Avatar>
      )}

      <div className="flex-1 min-w-0 space-y-2">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-gray-900">
            {isUser ? 'You' : agentId ? undefined : 'Assistant'}
          </p>
          {!isUser && agentId && (
            <AgentBadge agentId={agentId} size="sm" />
          )}
        </div>

        {/* Thinking process - collapsible */}
        {thinking && (
          <div className="rounded-lg border border-purple-100 bg-purple-50/50 overflow-hidden">
            <button
              className="flex items-center gap-2 w-full px-3 py-2 text-sm text-purple-700 hover:bg-purple-100/50 transition-colors"
              onClick={() => setIsThinkingExpanded(!isThinkingExpanded)}
            >
              {isThinkingExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              <Brain className="h-3.5 w-3.5" />
              <span className="font-medium">思考过程</span>
            </button>
            {isThinkingExpanded && (
              <div className="px-3 pb-3 border-t border-purple-100">
                <div className="prose prose-sm max-w-none text-purple-800/80 leading-relaxed pt-2">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {thinking}
                  </ReactMarkdown>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Text content */}
        <div className="prose prose-sm max-w-none text-gray-700 leading-relaxed">
          {content ? (
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                pre: ({ children }) => (
                  <pre className="overflow-x-auto rounded-xl bg-gray-900 p-4 text-sm text-gray-100 shadow-lg">
                    {children}
                  </pre>
                ),
                code: ({ className, children, ...props }) => {
                  const match = /language-(\w+)/.exec(className || '')
                  const isInline = !match
                  return isInline ? (
                    <code
                      className="rounded-md bg-gray-100 px-1.5 py-0.5 text-sm font-medium text-gray-800 border border-gray-200"
                      {...props}
                    >
                      {children}
                    </code>
                  ) : (
                    <code className={className} {...props}>
                      {children}
                    </code>
                  )
                },
              }}
            >
              {content}
            </ReactMarkdown>
          ) : isStreaming && (!toolCalls || toolCalls.length === 0) ? (
            <div className="flex items-center gap-2 text-gray-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">思考中...</span>
            </div>
          ) : null}
        </div>

        {/* Tool calls */}
        {toolCalls && toolCalls.length > 0 && (
          <div className="space-y-2 pt-2">
            {isStreaming && (
              <div className="flex items-center gap-2 text-gray-500 text-sm">
                <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                <span>执行工具中...</span>
              </div>
            )}
            {toolCalls.map((toolCall) => (
              <ToolCallItem key={toolCall.id} toolCall={toolCall} />
            ))}
          </div>
        )}
      </div>

      {/* Delete button */}
      {onDelete && isHovered && !isStreaming && (
        <Button
          variant="ghost"
          size="icon"
          className="absolute top-3 right-3 h-7 w-7 rounded-lg opacity-0 group-hover:opacity-60 hover:opacity-100 hover:bg-red-50 hover:text-red-500 transition-all"
          onClick={onDelete}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  )
}
