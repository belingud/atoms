import { create } from 'zustand'
import { createClient } from '@/lib/supabase/client'
import type { Message } from '@/lib/types/database'
import type { AgentId } from '@/lib/types/agent'
import { usePreviewStore } from './preview-store'
import { parseMentions } from '@/lib/utils/mention-parser'
import { DEFAULT_AGENT_ID, getAgent } from '@/lib/agents/config'

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
  agentId?: string
  delegatedFrom?: string
  isStreaming?: boolean
  toolCalls?: ToolCall[]
}

interface ChatState {
  messages: ChatMessage[]
  messagesProjectId: string | null  // Track which project the current messages belong to
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
// Supports two formats:
// 1. Standard: <!--TOOL_CALLS:[{id, name, arguments}]-->
// 2. Fallback for some models: <tools>{"name": "...", "arguments": {...}}</tools>
function parseToolCalls(content: string): { cleanContent: string; toolCalls: ToolCall[] } {
  debug('parseToolCalls input length:', content.length)

  // Try standard format first
  const toolCallsMatch = content.match(/<!--TOOL_CALLS:(.*?)-->/)
  if (toolCallsMatch) {
    debug('Found standard TOOL_CALLS marker')
    try {
      const toolCallsData = JSON.parse(toolCallsMatch[1]) as Array<{
        id: string
        name: string
        arguments: string
      }>

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
      return { cleanContent, toolCalls }
    } catch (error) {
      console.error('Failed to parse standard tool calls:', error)
    }
  }

  // Fallback: try <tools> format (used by some models like Qwen)
  const toolsTagMatch = content.match(/<tools>\s*([\s\S]*?)\s*<\/tools>/i)
  if (toolsTagMatch) {
    debug('Found <tools> tag format')
    try {
      const toolJson = JSON.parse(toolsTagMatch[1]) as {
        name: string
        arguments: Record<string, unknown>
      }

      const toolCalls: ToolCall[] = [{
        id: `tool_${Date.now()}`,
        name: toolJson.name,
        arguments: toolJson.arguments || {},
        status: 'pending' as const,
      }]

      const cleanContent = content.replace(/<tools>[\s\S]*?<\/tools>/gi, '').trim()
      debug('Parsed <tools> format, tool:', toolJson.name)
      return { cleanContent, toolCalls }
    } catch (error) {
      console.error('Failed to parse <tools> format:', error)
    }
  }

  // No tool calls found
  debug('No tool calls found in response')
  return { cleanContent: content, toolCalls: [] }
}

// Delegate task info stored for later execution
interface DelegateTaskInfo {
  agentId: string
  task: string
}

// Execute a tool call
async function executeToolCall(
  toolCall: ToolCall,
  projectId: string,
  updateToolStatus: (id: string, status: ToolCall['status'], result?: string) => void
): Promise<{ result: string | null; delegation?: DelegateTaskInfo }> {
  updateToolStatus(toolCall.id, 'running')

  try {
    // Handle delegate_task specially - collect info for later execution
    if (toolCall.name === 'delegate_task') {
      const { agent_id, task } = toolCall.arguments as { agent_id: string; task: string }
      const agent = getAgent(agent_id)
      const result = `已委派给 ${agent.name}`
      updateToolStatus(toolCall.id, 'completed', result)
      return { result, delegation: { agentId: agent_id, task } }
    }

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
    return { result }
  } catch (error) {
    console.error('Tool execution error:', error)
    updateToolStatus(toolCall.id, 'error')
    return { result: `Error: ${(error as Error).message}` }
  }
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  messagesProjectId: null,
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
          agentId: m.agent_id || undefined,
          toolCalls: toolCalls.length > 0 ? toolCalls.map(tc => ({ ...tc, status: 'completed' as const })) : undefined,
        }
      })

      set({ messages, messagesProjectId: projectId, isLoading: false })
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false })
    }
  },

  sendMessage: async (projectId: string, content: string) => {
    // Parse @mentions from input
    const parsed = parseMentions(content)
    const agentId = parsed.agentId
    const cleanContent = parsed.mentions.length > 0 ? parsed.content : content

    const userMessageId = crypto.randomUUID()

    // Add user message immediately and mark this project as owning the messages
    set((state) => ({
      messages: [
        ...state.messages,
        { id: userMessageId, role: 'user' as const, content },
      ],
      messagesProjectId: projectId,
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
        assistantMessageId: string,
        currentAgentId: string,
      ): Promise<string> => {
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId, messages: msgs, agentId: currentAgentId }),
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

      // Result of an agent loop
      interface AgentLoopResult {
        delegations: DelegateTaskInfo[]
        finalContent: string
        conversationMessages: Array<{ role: string; content: string }>
      }

      // Run conversation loop for a specific agent
      const runAgentLoop = async (
        currentAgentId: string,
        initialMessages: Array<{ role: string; content: string }>,
        delegatedFrom?: string,
      ): Promise<AgentLoopResult> => {
        let conversationMessages = [...initialMessages]
        let continueLoop = true
        let loopCount = 0
        const maxLoops = 40
        const pendingDelegations: DelegateTaskInfo[] = []
        let lastContent = ''

        while (continueLoop && loopCount < maxLoops) {
          loopCount++
          debug(`\n=== AI Call #${loopCount} (Agent: ${currentAgentId}) ===`)

          const assistantMessageId = crypto.randomUUID()

          // Add placeholder for assistant message with agent info
          set((state) => ({
            messages: [
              ...state.messages,
              {
                id: assistantMessageId,
                role: 'assistant' as const,
                content: '',
                agentId: currentAgentId,
                delegatedFrom,
                isStreaming: true,
              },
            ],
          }))

          // Call AI with streaming
          const rawContent = await callAI(conversationMessages, assistantMessageId, currentAgentId)
          debug('Raw AI response:', rawContent)

          // Parse tool calls
          const { cleanContent: parsedContent, toolCalls } = parseToolCalls(rawContent)
          lastContent = parsedContent

          // Update message with content and tool calls
          set((state) => ({
            messages: state.messages.map((m) =>
              m.id === assistantMessageId
                ? { ...m, content: parsedContent, toolCalls: toolCalls.length > 0 ? toolCalls : undefined, isStreaming: false }
                : m
            ),
          }))

          // If no tool calls, we're done
          if (toolCalls.length === 0) {
            continueLoop = false
            await supabase.from('messages').insert({
              id: assistantMessageId,
              project_id: projectId,
              role: 'assistant',
              content: rawContent,
              agent_id: currentAgentId,
            })
          } else {
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
              const { result, delegation } = await executeToolCall(toolCall, projectId, updateToolStatus)
              toolResults.push({ toolCallId: toolCall.id, result: result || '' })
              updateToolStatus(toolCall.id, 'completed', result || undefined)

              // Collect delegations for later execution
              if (delegation) {
                pendingDelegations.push(delegation)
              }
            }

            // Refresh files after tools executed
            const hasFileTools = toolCalls.some(tc => tc.name !== 'delegate_task')
            if (hasFileTools) {
              const previewStore = usePreviewStore.getState()
              await previewStore.fetchFiles(projectId)
            }

            // Save assistant message
            await supabase.from('messages').insert({
              id: assistantMessageId,
              project_id: projectId,
              role: 'assistant',
              content: rawContent,
              agent_id: currentAgentId,
            })

            // If there are delegations, pause the loop to execute them
            if (pendingDelegations.length > 0) {
              continueLoop = false
            } else {
              // Continue loop with tool results
              conversationMessages = [
                ...conversationMessages,
                { role: 'assistant', content: parsedContent },
                {
                  role: 'user',
                  content: `Tool results:\n${toolResults.map(tr =>
                    `[${tr.toolCallId}]: ${tr.result}`
                  ).join('\n\n')}\n\nPlease continue based on these results.`
                },
              ]
            }
          }
        }

        return {
          delegations: pendingDelegations,
          finalContent: lastContent,
          conversationMessages,
        }
      }

      // Start with the initial agent
      const initialMessages = get().messages.filter(m => !m.isStreaming).map(m => ({
        role: m.role,
        content: m.content,
      }))

      let leaderResult = await runAgentLoop(agentId, initialMessages)
      const maxDelegationRounds = 5
      let delegationRound = 0

      // Orchestration loop: leader delegates → agents execute → results return to leader
      while (leaderResult.delegations.length > 0 && delegationRound < maxDelegationRounds) {
        delegationRound++
        debug(`\n=== Delegation Round ${delegationRound} ===`)

        const delegationResults: string[] = []

        // Execute each delegation sequentially
        for (const delegation of leaderResult.delegations) {
          const delegatedAgent = getAgent(delegation.agentId)
          debug(`Delegating to ${delegatedAgent.name}: ${delegation.task}`)

          const delegationMessages: Array<{ role: string; content: string }> = [
            {
              role: 'user',
              content: `团队领导委派给你的任务:\n\n${delegation.task}\n\n请立即执行这个任务。完成后请总结你的工作成果。`,
            },
          ]

          const agentResult = await runAgentLoop(delegation.agentId, delegationMessages, agentId)
          delegationResults.push(`**${delegatedAgent.name}的报告:**\n${agentResult.finalContent}`)
        }

        // Feed results back to leader and let it continue
        const feedbackMessages: Array<{ role: string; content: string }> = [
          ...leaderResult.conversationMessages,
          { role: 'assistant', content: leaderResult.finalContent },
          {
            role: 'user',
            content: `以下是委派任务的执行结果:\n\n${delegationResults.join('\n\n---\n\n')}\n\n请根据结果决定下一步：继续委派其他人，或者给用户汇总报告。`,
          },
        ]

        leaderResult = await runAgentLoop(agentId, feedbackMessages)
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
    set({ messages: [], messagesProjectId: null, error: null })
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
      set({ messages: [], messagesProjectId: projectId })
    } catch (error) {
      console.error('Failed to clear history:', error)
    }
  },
}))
