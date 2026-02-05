import { create } from 'zustand'
import { createClient } from '@/lib/supabase/client'
import type { Message } from '@/lib/types/database'
import type { AgentId } from '@/lib/types/agent'
import { usePreviewStore } from './preview-store'
import { useVersionStore } from './version-store'
import { useAgentStore } from './agent-store'
import { parseMentions } from '@/lib/utils/mention-parser'
import { getAgent } from '@/lib/agents/config'

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
  thinking?: string  // AI thinking process (from <think> or <thinking> tags)
  agentId?: string
  delegatedFrom?: string
  isStreaming?: boolean
  toolCalls?: ToolCall[]
}

interface ChatState {
  messages: ChatMessage[]
  messagesProjectId: string | null  // Track which project the current messages belong to
  isLoading: boolean  // For AI generation (sendMessage)
  isFetchingMessages: boolean  // For loading message history
  error: string | null

  fetchMessages: (projectId: string) => Promise<void>
  sendMessage: (projectId: string, content: string) => Promise<void>
  stopGeneration: () => void
  deleteMessage: (projectId: string, messageId: string) => Promise<void>
  deleteMessages: (projectId: string, messageIds: string[]) => Promise<void>
  clearHistory: (projectId: string) => Promise<void>
  clearMessages: () => void
}

// Global abort controller for cancelling requests
let abortController: AbortController | null = null

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

// Parse thinking content from the response
// Supports formats: <think>...</think>, <thinking>...</thinking>
function parseThinking(content: string): { cleanContent: string; thinking: string | null } {
  // Try <think>...</think> format (DeepSeek style)
  const thinkMatch = content.match(/<think>([\s\S]*?)<\/think>/i)
  if (thinkMatch) {
    const thinking = thinkMatch[1].trim()
    const cleanContent = content.replace(/<think>[\s\S]*?<\/think>/gi, '').trim()
    return { cleanContent, thinking }
  }

  // Try <thinking>...</thinking> format
  const thinkingMatch = content.match(/<thinking>([\s\S]*?)<\/thinking>/i)
  if (thinkingMatch) {
    const thinking = thinkingMatch[1].trim()
    const cleanContent = content.replace(/<thinking>[\s\S]*?<\/thinking>/gi, '').trim()
    return { cleanContent, thinking }
  }

  return { cleanContent: content, thinking: null }
}

// Delegate task info stored for later execution
interface DelegateTaskInfo {
  agentId: string
  task: string
  requirements: string
  context: string
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
      const { agent_id, task, requirements, context } = toolCall.arguments as {
        agent_id: string; task: string; requirements?: string; context?: string
      }
      const agent = getAgent(agent_id)
      const result = `已委派给 ${agent.name}`
      updateToolStatus(toolCall.id, 'completed', result)
      return {
        result,
        delegation: {
          agentId: agent_id,
          task,
          requirements: requirements || '',
          context: context || '',
        },
      }
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
      case 'update_file': {
        const { path, old_content, new_content } = toolCall.arguments as { path: string; old_content: string; new_content: string }
        const updateResult = await previewStore.updateFile(projectId, path, old_content, new_content)
        result = updateResult.success
          ? `File updated: ${path}`
          : `Failed to update file: ${updateResult.error}`
        break
      }
      case 'read_file': {
        const { path } = toolCall.arguments as { path: string }
        const content = previewStore.getFileContent(path)
        result = content !== null ? content : `File not found: ${path}`
        break
      }
      case 'delete_file': {
        const { path } = toolCall.arguments as { path: string }
        const success = await previewStore.deleteFile(projectId, path)
        result = success ? `File deleted: ${path}` : `Failed to delete file: ${path}`
        break
      }
      case 'list_directory': {
        const { path, depth } = toolCall.arguments as { path: string; depth?: number }
        const items = previewStore.listDirectory(path, depth || 1)
        if (items.length === 0) {
          result = `目录 ${path || '/'} 为空（这是正常的，项目刚创建时没有文件）`
        } else {
          // Format directory listing with tree structure
          const formatItems = (list: typeof items, indent: string = ''): string => {
            return list.map(item => {
              const icon = item.type === 'directory' ? '📁' : '📄'
              const line = `${indent}${icon} ${item.name}`
              if (item.children && item.children.length > 0) {
                return line + '\n' + formatItems(item.children, indent + '  ')
              }
              return line
            }).join('\n')
          }
          result = `目录 ${path || '/'} 内容:\n` + formatItems(items)
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
  isFetchingMessages: false,
  error: null,

  fetchMessages: async (projectId: string) => {
    set({ isFetchingMessages: true, error: null })
    try {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: true })

      if (error) throw error

      const messages: ChatMessage[] = (data || []).map((m: Message) => {
        // Parse stored tool calls and thinking if any
        const { cleanContent: contentWithoutTools, toolCalls } = parseToolCalls(m.content)
        const { cleanContent, thinking } = parseThinking(contentWithoutTools)
        return {
          id: m.id,
          role: m.role,
          content: cleanContent,
          thinking: thinking || undefined,
          agentId: m.agent_id || undefined,
          toolCalls: toolCalls.length > 0 ? toolCalls.map(tc => ({ ...tc, status: 'completed' as const })) : undefined,
        }
      })

      // Restore the last active agent from message history
      const lastAssistantMsg = [...messages].reverse().find(m => m.role === 'assistant' && m.agentId)
      if (lastAssistantMsg?.agentId) {
        useAgentStore.getState().setCurrentAgent(lastAssistantMsg.agentId as AgentId)
      } else {
        useAgentStore.getState().resetAgent()
      }

      set({ messages, messagesProjectId: projectId, isFetchingMessages: false })
    } catch (error) {
      set({ error: (error as Error).message, isFetchingMessages: false })
    }
  },

  stopGeneration: () => {
    debug('🛑 用户请求停止生成')
    if (abortController) {
      abortController.abort()
      abortController = null
    }
    set({ isLoading: false })
    debug('✅ 生成已停止')
  },

  sendMessage: async (projectId: string, content: string) => {
    // Parse @mentions from input
    const parsed = parseMentions(content)
    // If no @mention, continue with the last active agent instead of defaulting to engineer
    const agentId = parsed.mentions.length > 0
      ? parsed.agentId
      : useAgentStore.getState().currentAgentId
    const cleanContent = parsed.mentions.length > 0 ? parsed.content : content

    const userMessageId = crypto.randomUUID()

    // Check if we're switching projects - if so, clear old messages
    const currentState = get()
    const isSwitchingProjects = currentState.messagesProjectId !== projectId

    // Add user message immediately and mark this project as owning the messages
    set((state) => ({
      // If switching projects, start fresh; otherwise append to existing messages
      messages: isSwitchingProjects
        ? [{ id: userMessageId, role: 'user' as const, content }]
        : [...state.messages, { id: userMessageId, role: 'user' as const, content }],
      messagesProjectId: projectId,
      isLoading: true,
      error: null,
    }))

    try {
      // Create new abort controller for this session
      abortController = new AbortController()
      const signal = abortController.signal

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
        // Check if aborted before starting
        if (signal.aborted) {
          throw new Error('Generation stopped by user')
        }

        const agent = getAgent(currentAgentId)
        debug(`[${agent.name}] 🚀 开始 API 请求...`)

        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId, messages: msgs, agentId: currentAgentId }),
          signal,
        })

        if (!response.ok) {
          debug(`[${agent.name}] ❌ API 请求失败: ${response.status}`)
          throw new Error('Failed to get AI response')
        }

        debug(`[${agent.name}] 📡 开始接收流式响应...`)
        const reader = response.body?.getReader()
        const decoder = new TextDecoder()
        let rawContent = ''
        let chunkCount = 0

        if (reader) {
          try {
            while (true) {
              // Check if aborted
              if (signal.aborted) {
                await reader.cancel()
                throw new Error('Generation stopped by user')
              }

              const { done, value } = await reader.read()
              if (done) break

              chunkCount++
              const chunk = decoder.decode(value)
              rawContent += chunk

              // Update UI with streaming content (excluding tool call marker and thinking tags)
              let displayContent = rawContent
                .replace(/\n?<!--TOOL_CALLS:[\s\S]*$/, '')
                .replace(/<think>[\s\S]*?<\/think>/gi, '')
                .replace(/<thinking>[\s\S]*?<\/thinking>/gi, '')
                .trim()
              // Also hide incomplete thinking tags during streaming
              displayContent = displayContent
                .replace(/<think>[\s\S]*$/i, '')
                .replace(/<thinking>[\s\S]*$/i, '')
                .trim()
              set((state) => ({
                messages: state.messages.map((m) =>
                  m.id === assistantMessageId
                    ? { ...m, content: displayContent }
                    : m
                ),
              }))
            }
          } catch (e) {
            if (signal.aborted) {
              throw new Error('Generation stopped by user')
            }
            throw e
          }
        }

        debug(`[${agent.name}] ✅ 响应完成 (${chunkCount} chunks, ${rawContent.length} chars)`)
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
        const agent = getAgent(currentAgentId)
        debug(`\n${'='.repeat(50)}`)
        debug(`🤖 [${agent.name}] 开始执行${delegatedFrom ? ` (由 ${getAgent(delegatedFrom).name} 委派)` : ''}`)
        debug(`${'='.repeat(50)}`)

        let conversationMessages = [...initialMessages]
        let continueLoop = true
        let loopCount = 0
        const maxLoops = 100
        const pendingDelegations: DelegateTaskInfo[] = []
        let lastContent = ''

        // Track file operations for version snapshot (created once at end of loop)
        const fileOperations: Array<{ type: string; path: string }> = []
        let lastFileModifyingMessageId: string | null = null

        while (continueLoop && loopCount < maxLoops) {
          loopCount++
          debug(`\n[${agent.name}] 📍 对话轮次 #${loopCount}/${maxLoops}`)

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

          // Parse tool calls and thinking
          const { cleanContent: contentWithoutTools, toolCalls } = parseToolCalls(rawContent)
          const { cleanContent: parsedContent, thinking } = parseThinking(contentWithoutTools)
          lastContent = parsedContent

          // Update message with content, thinking, and tool calls
          set((state) => ({
            messages: state.messages.map((m) =>
              m.id === assistantMessageId
                ? {
                    ...m,
                    content: parsedContent,
                    thinking: thinking || undefined,
                    toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
                    isStreaming: false,
                  }
                : m
            ),
          }))

          // If no tool calls, we're done
          if (toolCalls.length === 0) {
            debug(`[${agent.name}] 💬 纯文本响应，无工具调用`)
            continueLoop = false
            await supabase.from('messages').insert({
              id: assistantMessageId,
              project_id: projectId,
              role: 'assistant',
              content: rawContent,
              agent_id: currentAgentId,
            })
            debug(`[${agent.name}] 💾 消息已保存到数据库`)
          } else {
            debug(`[${agent.name}] 🔧 检测到 ${toolCalls.length} 个工具调用: ${toolCalls.map(tc => tc.name).join(', ')}`)
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
            for (let i = 0; i < toolCalls.length; i++) {
              const toolCall = toolCalls[i]
              debug(`[${agent.name}] ⚙️ 执行工具 (${i + 1}/${toolCalls.length}): ${toolCall.name}`)
              debug(`[${agent.name}] 📥 工具参数:`, JSON.stringify(toolCall.arguments))
              const { result, delegation } = await executeToolCall(toolCall, projectId, updateToolStatus)
              debug(`[${agent.name}] ✓ 工具完成: ${toolCall.name} → 结果长度: ${(result || '').length}`)
              debug(`[${agent.name}] 📤 工具结果预览:`, (result || '').substring(0, 200))
              toolResults.push({ toolCallId: toolCall.id, result: result || '' })
              updateToolStatus(toolCall.id, 'completed', result || undefined)

              // Collect delegations for later execution
              if (delegation) {
                debug(`[${agent.name}] 📤 委派任务给 ${delegation.agentId}: ${delegation.task.substring(0, 50)}...`)
                pendingDelegations.push(delegation)
              }
            }

            // Refresh files after tools executed
            const fileModifyingTools = ['write_file', 'update_file', 'delete_file']
            const hasFileTools = toolCalls.some(tc => fileModifyingTools.includes(tc.name))
            if (hasFileTools) {
              debug(`[${agent.name}] 🔄 刷新文件列表...`)
              const previewStore = usePreviewStore.getState()
              await previewStore.fetchFiles(projectId)

              // Track file operations for version snapshot (will be created at end of loop)
              toolCalls.filter(tc => fileModifyingTools.includes(tc.name)).forEach(tc => {
                fileOperations.push({
                  type: tc.name,
                  path: (tc.arguments as { path?: string }).path || '',
                })
              })
              lastFileModifyingMessageId = assistantMessageId
            }

            // Save assistant message
            await supabase.from('messages').insert({
              id: assistantMessageId,
              project_id: projectId,
              role: 'assistant',
              content: rawContent,
              agent_id: currentAgentId,
            })
            debug(`[${agent.name}] 💾 消息已保存到数据库`)

            // If there are delegations, pause the loop to execute them
            if (pendingDelegations.length > 0) {
              debug(`[${agent.name}] ⏸️ 暂停循环，等待执行 ${pendingDelegations.length} 个委派任务`)
              continueLoop = false
            } else {
              debug(`[${agent.name}] ➡️ 继续下一轮对话，附带 ${toolResults.length} 个工具结果...`)
              // Continue loop with tool results
              const toolResultsContent = toolResults.map(tr =>
                `### ${tr.toolCallId}\n${tr.result}`
              ).join('\n\n')
              conversationMessages = [
                ...conversationMessages,
                { role: 'assistant', content: parsedContent },
                {
                  role: 'user',
                  content: `工具执行完成，以下是结果：\n\n${toolResultsContent}\n\n请根据这些结果继续工作。如果目录为空，说明这是新项目，你可以开始创建文件。`,
                },
              ]
              debug(`[${agent.name}] 📤 已准备下一轮消息，共 ${conversationMessages.length} 条`)
            }
          }
        }

        debug(`[${agent.name}] 🏁 执行完成，共 ${loopCount} 轮对话`)

        // Create version snapshot at the end of the loop (only once, after all file operations)
        if (fileOperations.length > 0 && lastFileModifyingMessageId) {
          debug(`[${agent.name}] 📸 创建版本快照...`)
          const created = fileOperations.filter(op => op.type === 'write_file').length
          const updated = fileOperations.filter(op => op.type === 'update_file').length
          const deleted = fileOperations.filter(op => op.type === 'delete_file').length

          const parts: string[] = []
          if (created > 0) parts.push(`创建 ${created} 个文件`)
          if (updated > 0) parts.push(`更新 ${updated} 个文件`)
          if (deleted > 0) parts.push(`删除 ${deleted} 个文件`)

          const description = `${agent.name}: ${parts.join('，')}`
          const versionStore = useVersionStore.getState()
          await versionStore.createSnapshot(projectId, currentAgentId, description, lastFileModifyingMessageId)
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

      debug(`\n${'#'.repeat(60)}`)
      debug(`# 开始对话 - 初始 Agent: ${getAgent(agentId).name}`)
      debug(`${'#'.repeat(60)}`)

      let leaderResult = await runAgentLoop(agentId, initialMessages)
      const maxDelegationRounds = 5
      let delegationRound = 0

      // Orchestration loop: leader delegates → agents execute → results return to leader
      while (leaderResult.delegations.length > 0 && delegationRound < maxDelegationRounds) {
        delegationRound++
        debug(`\n${'*'.repeat(60)}`)
        debug(`* 委派循环 第 ${delegationRound}/${maxDelegationRounds} 轮`)
        debug(`* 待执行委派: ${leaderResult.delegations.map(d => d.agentId).join(', ')}`)
        debug(`${'*'.repeat(60)}`)

        const delegationResults: string[] = []

        // Execute each delegation sequentially
        for (let i = 0; i < leaderResult.delegations.length; i++) {
          const delegation = leaderResult.delegations[i]
          const delegatedAgent = getAgent(delegation.agentId)
          debug(`\n📋 执行委派 (${i + 1}/${leaderResult.delegations.length}): ${delegatedAgent.name}`)
          debug(`📋 任务: ${delegation.task.substring(0, 100)}`)
          debug(`📋 要求: ${delegation.requirements.substring(0, 100)}`)
          debug(`📋 上下文: ${delegation.context.substring(0, 100)}`)

          const delegationMessages: Array<{ role: string; content: string }> = [
            {
              role: 'user',
              content: [
                `## 任务`,
                delegation.task,
                delegation.requirements ? `\n## 具体要求\n${delegation.requirements}` : '',
                delegation.context ? `\n## 背景信息\n${delegation.context}` : '',
                `\n---\n请立即执行这个任务。完成后请总结你的工作成果。`,
              ].filter(Boolean).join('\n'),
            },
          ]

          const agentResult = await runAgentLoop(delegation.agentId, delegationMessages, agentId)
          delegationResults.push(`**${delegatedAgent.name}的报告:**\n${agentResult.finalContent}`)
          debug(`✅ ${delegatedAgent.name} 执行完成`)
        }

        // Feed results back to leader and let it continue
        debug(`\n🔄 将执行结果返回给 ${getAgent(agentId).name}...`)
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

      if (delegationRound >= maxDelegationRounds) {
        debug(`⚠️ 达到最大委派轮数限制 (${maxDelegationRounds})`)
      }

      debug(`\n${'#'.repeat(60)}`)
      debug(`# 对话完成`)
      debug(`${'#'.repeat(60)}\n`)

      // Remember this agent for the next turn
      useAgentStore.getState().setCurrentAgent(agentId)

      debug(`🏁 设置 isLoading = false`)
      abortController = null
      set({ isLoading: false })
      debug(`✅ 完成，isLoading 已重置`)
    } catch (error) {
      const errorMessage = (error as Error).message
      const isAborted = errorMessage === 'Generation stopped by user' ||
                        (error as Error).name === 'AbortError'

      if (isAborted) {
        debug(`🛑 生成已被用户停止`)
      } else {
        console.error('sendMessage error:', error)
        debug(`❌ 错误: ${errorMessage}`)
      }

      abortController = null
      set({
        // Don't show error for user-initiated stops
        error: isAborted ? null : errorMessage,
        isLoading: false,
      })
    }
  },

  clearMessages: () => {
    set({ messages: [], messagesProjectId: null, error: null })
    // Reset to default agent when clearing messages
    useAgentStore.getState().resetAgent()
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
      // Reset to default agent when clearing history
      useAgentStore.getState().resetAgent()
    } catch (error) {
      console.error('Failed to clear history:', error)
    }
  },
}))
