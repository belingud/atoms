import { create } from 'zustand'
import { createClient } from '@/lib/supabase/client'
import type { Message } from '@/lib/types/database'
import { usePreviewStore } from './preview-store'

export interface ToolCall {
  id: string
  name: string
  arguments: Record<string, unknown>
  status: 'pending' | 'running' | 'completed' | 'error'
  result?: string
}

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  isStreaming?: boolean
  toolCalls?: ToolCall[]
}

interface ChatState {
  messages: ChatMessage[]
  isLoading: boolean
  error: string | null

  fetchMessages: (projectId: string) => Promise<void>
  sendMessage: (projectId: string, content: string) => Promise<void>
  deleteMessage: (projectId: string, messageId: string) => Promise<void>
  deleteMessages: (projectId: string, messageIds: string[]) => Promise<void>
  clearHistory: (projectId: string) => Promise<void>
  clearMessages: () => void
}

const isDev = process.env.NODE_ENV === 'development'

// Debug logger
const debug = (...args: unknown[]) => {
  if (isDev) {
    console.log(...args)
  }
}

// Parse tool calls from the response
function parseToolCalls(content: string): { cleanContent: string; toolCalls: ToolCall[] } {
  debug('parseToolCalls input length:', content.length)
  debug('parseToolCalls looking for TOOL_CALLS marker...')

  const toolCallsMatch = content.match(/<!--TOOL_CALLS:(.*?)-->/)
  debug('Tool calls marker found:', !!toolCallsMatch)

  if (!toolCallsMatch) {
    debug('No tool calls found in response')
    return { cleanContent: content, toolCalls: [] }
  }

  try {
    debug('Parsing tool calls JSON:', toolCallsMatch[1].substring(0, 200))
    const toolCallsData = JSON.parse(toolCallsMatch[1]) as Array<{
      id: string
      name: string
      arguments: string
    }>

    debug('Parsed tool calls data:', toolCallsData)

    const toolCalls: ToolCall[] = toolCallsData.map(tc => {
      let args: Record<string, unknown> = {}
      if (tc.arguments) {
        try {
          args = JSON.parse(tc.arguments)
        } catch (e) {
          console.error('Failed to parse tool call arguments:', tc.arguments, e)
          args = { _raw: tc.arguments }
        }
      }
      return {
        id: tc.id,
        name: tc.name,
        arguments: args,
        status: 'pending' as const,
      }
    })

    const cleanContent = content.replace(/\n?<!--TOOL_CALLS:.*?-->/g, '').trim()
    debug('Clean content length:', cleanContent.length)
    debug('Parsed tool calls count:', toolCalls.length)
    return { cleanContent, toolCalls }
  } catch (error) {
    console.error('Failed to parse tool calls:', error)
    return { cleanContent: content.replace(/\n?<!--TOOL_CALLS:.*?-->/g, '').trim(), toolCalls: [] }
  }
}

// Execute a tool call
async function executeToolCall(
  toolCall: ToolCall,
  projectId: string,
  updateToolStatus: (id: string, status: ToolCall['status'], result?: string) => void
): Promise<string | null> {
  updateToolStatus(toolCall.id, 'running')

  try {
    const previewStore = usePreviewStore.getState()
    let result: string | null = null

    switch (toolCall.name) {
      case 'write_file': {
        const { path, content } = toolCall.arguments as { path: string; content: string }
        await previewStore.saveFile(projectId, path, content)
        result = `File written: ${path}`
        break
      }
      case 'read_file': {
        const { path } = toolCall.arguments as { path: string }
        const content = previewStore.getFileContent(path)
        result = content !== null ? content : `File not found: ${path}`
        break
      }
      case 'list_directory': {
        const { path } = toolCall.arguments as { path: string }
        const items = previewStore.listDirectory(path)
        if (items.length === 0) {
          result = `Directory empty or not found: ${path}`
        } else {
          result = items.map(item =>
            `${item.type === 'directory' ? '📁' : '📄'} ${item.name}`
          ).join('\n')
        }
        break
      }
      case 'search_files': {
        const { pattern } = toolCall.arguments as { pattern: string }
        const files = previewStore.searchFiles(pattern)
        if (files.length === 0) {
          result = `No files found matching: ${pattern}`
        } else {
          result = files.join('\n')
        }
        break
      }
      case 'run_command': {
        const { command } = toolCall.arguments as { command: string }
        try {
          result = await previewStore.queueCommand(command)
        } catch (error) {
          result = `Command failed: ${(error as Error).message}`
        }
        break
      }
      case 'run_preview': {
        previewStore.triggerRunPreview()
        result = 'Preview started'
        break
      }
      default:
        console.warn('Unknown tool:', toolCall.name)
        result = `Unknown tool: ${toolCall.name}`
    }

    updateToolStatus(toolCall.id, 'completed')
    return result
  } catch (error) {
    console.error('Tool execution error:', error)
    updateToolStatus(toolCall.id, 'error')
    return `Error: ${(error as Error).message}`
  }
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  isLoading: false,
  error: null,

  fetchMessages: async (projectId: string) => {
    set({ isLoading: true, error: null })
    try {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: true })

      if (error) throw error

      const messages: ChatMessage[] = (data || []).map((m: Message) => {
        // Parse stored tool calls if any
        const { cleanContent, toolCalls } = parseToolCalls(m.content)
        return {
          id: m.id,
          role: m.role,
          content: cleanContent,
          toolCalls: toolCalls.length > 0 ? toolCalls.map(tc => ({ ...tc, status: 'completed' as const })) : undefined,
        }
      })

      set({ messages, isLoading: false })
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false })
    }
  },

  sendMessage: async (projectId: string, content: string) => {
    const userMessageId = crypto.randomUUID()

    // Add user message immediately
    set((state) => ({
      messages: [
        ...state.messages,
        { id: userMessageId, role: 'user' as const, content },
      ],
      isLoading: true,
      error: null,
    }))

    try {
      // Save user message to database
      const supabase = createClient()
      await supabase.from('messages').insert({
        id: userMessageId,
        project_id: projectId,
        role: 'user',
        content,
      })

      // Helper function to call AI and handle streaming response
      const callAI = async (
        msgs: Array<{ role: string; content: string }>,
        assistantMessageId: string
      ): Promise<string> => {
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId, messages: msgs }),
        })

        if (!response.ok) {
          throw new Error('Failed to get AI response')
        }

        const reader = response.body?.getReader()
        const decoder = new TextDecoder()
        let rawContent = ''

        if (reader) {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break

            const chunk = decoder.decode(value)
            rawContent += chunk

            // Update UI with streaming content (excluding tool call marker)
            const displayContent = rawContent.replace(/\n?<!--TOOL_CALLS:[\s\S]*$/, '').trim()
            set((state) => ({
              messages: state.messages.map((m) =>
                m.id === assistantMessageId
                  ? { ...m, content: displayContent }
                  : m
              ),
            }))
          }
        }

        return rawContent
      }

      // Conversation loop - continue until no more tool calls
      let conversationMessages = get().messages.filter(m => !m.isStreaming).map(m => ({
        role: m.role,
        content: m.content,
      }))

      let continueLoop = true
      let loopCount = 0
      const maxLoops = 40 // Prevent infinite loops

      while (continueLoop && loopCount < maxLoops) {
        loopCount++
        debug(`\n=== AI Call #${loopCount} ===`)
        debug('Sending messages:', JSON.stringify(conversationMessages, null, 2))

        const assistantMessageId = crypto.randomUUID()

        // Add placeholder for assistant message
        set((state) => ({
          messages: [
            ...state.messages,
            { id: assistantMessageId, role: 'assistant' as const, content: '', isStreaming: true },
          ],
        }))

        // Call AI with streaming
        const rawContent = await callAI(conversationMessages, assistantMessageId)
        debug('Raw AI response:', rawContent)

        // Parse tool calls
        const { cleanContent, toolCalls } = parseToolCalls(rawContent)
        debug('Parsed content:', cleanContent)
        debug('Parsed tool calls:', JSON.stringify(toolCalls, null, 2))

        // Update message with content and tool calls
        set((state) => ({
          messages: state.messages.map((m) =>
            m.id === assistantMessageId
              ? { ...m, content: cleanContent, toolCalls: toolCalls.length > 0 ? toolCalls : undefined, isStreaming: false }
              : m
          ),
        }))

        // If no tool calls, we're done
        if (toolCalls.length === 0) {
          debug('No tool calls, ending conversation loop')
          continueLoop = false
          // Save to database
          await supabase.from('messages').insert({
            id: assistantMessageId,
            project_id: projectId,
            role: 'assistant',
            content: rawContent,
          })
        } else {
          debug(`Executing ${toolCalls.length} tool calls...`)
          // Execute tool calls and collect results
          const toolResults: Array<{ toolCallId: string; result: string }> = []

          const updateToolStatus = (toolId: string, status: ToolCall['status'], result?: string) => {
            set((state) => ({
              messages: state.messages.map((m) =>
                m.id === assistantMessageId
                  ? {
                      ...m,
                      toolCalls: m.toolCalls?.map(tc =>
                        tc.id === toolId ? { ...tc, status, result } : tc
                      ),
                    }
                  : m
              ),
            }))
          }

          // Execute tools sequentially
          for (const toolCall of toolCalls) {
            const result = await executeToolCall(toolCall, projectId, updateToolStatus)
            toolResults.push({ toolCallId: toolCall.id, result: result || '' })
            // Update tool with result
            updateToolStatus(toolCall.id, 'completed', result || undefined)
          }

          // Refresh files after all tools executed
          const previewStore = usePreviewStore.getState()
          await previewStore.fetchFiles(projectId)

          // Save assistant message with tool calls
          await supabase.from('messages').insert({
            id: assistantMessageId,
            project_id: projectId,
            role: 'assistant',
            content: rawContent,
          })

          // Add tool results to conversation for next AI call
          conversationMessages = [
            ...conversationMessages,
            { role: 'assistant', content: cleanContent },
            {
              role: 'user',
              content: `Tool results:\n${toolResults.map(tr =>
                `[${tr.toolCallId}]: ${tr.result}`
              ).join('\n\n')}\n\nPlease continue based on these results.`
            },
          ]
          debug('Tool results message:', conversationMessages[conversationMessages.length - 1].content)
        }
      }

      if (loopCount >= maxLoops) {
        debug('Max loop count reached, stopping conversation')
      }

      set({ isLoading: false })
    } catch (error) {
      set((state) => ({
        error: (error as Error).message,
        isLoading: false,
      }))
    }
  },

  clearMessages: () => {
    set({ messages: [], error: null })
  },

  deleteMessage: async (projectId: string, messageId: string) => {
    try {
      const supabase = createClient()
      const { error } = await supabase.from('messages').delete().eq('id', messageId).eq('project_id', projectId)
      if (error) {
        console.error('Failed to delete message:', error)
        throw error
      }
      set((state) => ({
        messages: state.messages.filter(m => m.id !== messageId),
      }))
    } catch (error) {
      console.error('Failed to delete message:', error)
    }
  },

  deleteMessages: async (projectId: string, messageIds: string[]) => {
    if (messageIds.length === 0) return
    try {
      const supabase = createClient()
      const { error } = await supabase.from('messages').delete().in('id', messageIds).eq('project_id', projectId)
      if (error) {
        console.error('Failed to delete messages:', error)
        throw error
      }
      set((state) => ({
        messages: state.messages.filter(m => !messageIds.includes(m.id)),
      }))
    } catch (error) {
      console.error('Failed to delete messages:', error)
    }
  },

  clearHistory: async (projectId: string) => {
    try {
      const supabase = createClient()
      const { error } = await supabase.from('messages').delete().eq('project_id', projectId)
      if (error) {
        console.error('Failed to clear history:', error)
        throw error
      }
      set({ messages: [] })
    } catch (error) {
      console.error('Failed to clear history:', error)
    }
  },
}))
