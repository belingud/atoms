import { OpenAI } from 'openai'
import { createClient } from '@/lib/supabase/server'
import { getAgent, AGENTS } from '@/lib/agents/config'
import type { AgentId } from '@/lib/types/agent'

const isDev = process.env.NODE_ENV === 'development'

const debug = (...args: unknown[]) => {
  if (isDev) {
    console.log(...args)
  }
}

function getOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not configured')
  }
  return new OpenAI({
    apiKey,
    baseURL: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
  })
}

// All available tool definitions
const ALL_TOOLS: Record<string, OpenAI.Chat.Completions.ChatCompletionTool> = {
  write_file: {
    type: 'function',
    function: {
      name: 'write_file',
      description: 'Create a new file or completely rewrite an existing file. Use this for new files or when you need to replace the entire content.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'The file path starting with src/, e.g., src/App.tsx, src/components/Button.tsx',
          },
          content: {
            type: 'string',
            description: 'The complete file content to write',
          },
        },
        required: ['path', 'content'],
      },
    },
  },
  update_file: {
    type: 'function',
    function: {
      name: 'update_file',
      description: 'Update part of an existing file by replacing specific content. Use this when you only need to modify a portion of the file (e.g., fix a bug, add a function, change some lines). More efficient than rewriting the entire file.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'The file path to update, e.g., src/App.tsx',
          },
          old_content: {
            type: 'string',
            description: 'The exact content to find and replace. Must match exactly including whitespace and indentation.',
          },
          new_content: {
            type: 'string',
            description: 'The new content to replace with',
          },
        },
        required: ['path', 'old_content', 'new_content'],
      },
    },
  },
  read_file: {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Read the content of a file in the project.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'The file path to read, e.g., src/App.tsx',
          },
        },
        required: ['path'],
      },
    },
  },
  delete_file: {
    type: 'function',
    function: {
      name: 'delete_file',
      description: 'Delete a file from the project.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'The file path to delete, e.g., src/components/OldComponent.tsx',
          },
        },
        required: ['path'],
      },
    },
  },
  list_directory: {
    type: 'function',
    function: {
      name: 'list_directory',
      description: 'List files and directories in a given path. Supports recursive listing with depth control.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'The directory path to list, e.g., src or src/components. Use empty string for root.',
          },
          depth: {
            type: 'number',
            description: 'How many levels deep to list. 1 = direct children only (default), 2 = include grandchildren, etc. Use higher values to see full directory structure.',
          },
        },
        required: ['path'],
      },
    },
  },
  search_files: {
    type: 'function',
    function: {
      name: 'search_files',
      description: 'Search for files by name pattern in the project.',
      parameters: {
        type: 'object',
        properties: {
          pattern: {
            type: 'string',
            description: 'The search pattern, e.g., "Button" to find files containing "Button" in the name',
          },
        },
        required: ['pattern'],
      },
    },
  },
  run_command: {
    type: 'function',
    function: {
      name: 'run_command',
      description: 'Execute a shell command. WARNING: Do NOT use this for "npm install" - use run_preview instead which handles installation automatically. Only use this for other commands like "npm run build" or "npm run test".',
      parameters: {
        type: 'object',
        properties: {
          command: {
            type: 'string',
            description: 'The command to execute (NOT npm install)',
          },
        },
        required: ['command'],
      },
    },
  },
  run_preview: {
    type: 'function',
    function: {
      name: 'run_preview',
      description: 'Start or restart the preview server. This automatically runs npm install and npm run dev. Use this after writing files to see the app running. This is the PRIMARY way to run the application.',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
  delegate_task: {
    type: 'function',
    function: {
      name: 'delegate_task',
      description: '委派任务给团队中的其他Agent。只有团队领导可以使用此工具。可委派给: pm(产品经理-需求分析), engineer(工程师-写代码), analyst(数据分析师-图表), seo(SEO专家-优化)。必须提供详细的任务说明和必要的上下文信息。',
      parameters: {
        type: 'object',
        properties: {
          agent_id: {
            type: 'string',
            description: '目标Agent的ID: pm, engineer, analyst, seo',
            enum: ['pm', 'engineer', 'analyst', 'seo'],
          },
          task: {
            type: 'string',
            description: '具体的任务目标，清晰说明要做什么',
          },
          requirements: {
            type: 'string',
            description: '任务的具体要求，如技术栈、风格、约束条件、验收标准等',
          },
          context: {
            type: 'string',
            description: '必要的背景信息，如相关代码、文件路径、用户原始需求、前序Agent的产出结果等',
          },
        },
        required: ['agent_id', 'task', 'requirements', 'context'],
      },
    },
  },
}

// Get tools for a specific agent based on their allowed tool list
function getToolsForAgent(agentId: string): OpenAI.Chat.Completions.ChatCompletionTool[] {
  const agent = getAgent(agentId)
  return agent.tools
    .filter(name => ALL_TOOLS[name])
    .map(name => ALL_TOOLS[name])
}

export async function POST(request: Request) {
  try {
    // Verify authentication
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return new Response('Unauthorized', { status: 401 })
    }

    const { messages, projectId, agentId } = await request.json()

    if (!projectId || !messages) {
      return new Response('Missing required fields', { status: 400 })
    }

    // Verify project ownership
    const { data: project } = await supabase
      .from('projects')
      .select('id')
      .eq('id', projectId)
      .eq('user_id', user.id)
      .single()

    if (!project) {
      return new Response('Project not found', { status: 404 })
    }

    // Resolve agent
    const resolvedAgentId = agentId || 'engineer'
    const agent = getAgent(resolvedAgentId)
    const agentTools = getToolsForAgent(resolvedAgentId)

    const openai = getOpenAIClient()

    debug('\n=== API: Chat Request ===')
    debug('Model:', process.env.OPENAI_MODEL || 'gpt-4o')
    debug('Agent:', resolvedAgentId, agent.name)
    debug('Messages count:', messages.length)
    debug('Tools count:', agentTools.length)
    debug('Tool names:', agentTools.map(t => t.type === 'function' ? t.function.name : t.type))

    // Create streaming response with tools
    const stream = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o',
      messages: [
        { role: 'system', content: agent.systemPrompt },
        ...messages,
      ],
      tools: agentTools.length > 0 ? agentTools : undefined,
      tool_choice: agentTools.length > 0 ? 'auto' : undefined,
      stream: true,
    })

    // Handle streaming response with tool calls
    const encoder = new TextEncoder()
    let toolCalls: { id: string; name: string; arguments: string }[] = []
    let fullContent = ''
    let finishReason = ''

    const readableStream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            const delta = chunk.choices[0]?.delta
            const chunkFinishReason = chunk.choices[0]?.finish_reason

            // Track finish reason
            if (chunkFinishReason) {
              finishReason = chunkFinishReason
              debug('Finish reason:', finishReason)
            }

            // Handle text content
            if (delta?.content) {
              fullContent += delta.content
              controller.enqueue(encoder.encode(delta.content))
            }

            // Handle tool calls
            if (delta?.tool_calls) {
              // debug('Received tool_calls delta:', JSON.stringify(delta.tool_calls))
              for (const toolCall of delta.tool_calls) {
                const index = toolCall.index
                if (!toolCalls[index]) {
                  toolCalls[index] = {
                    id: toolCall.id || '',
                    name: toolCall.function?.name || '',
                    arguments: '',
                  }
                }
                if (toolCall.id) {
                  toolCalls[index].id = toolCall.id
                }
                if (toolCall.function?.name) {
                  toolCalls[index].name = toolCall.function.name
                }
                if (toolCall.function?.arguments) {
                  toolCalls[index].arguments += toolCall.function.arguments
                }
              }
            }
          }

          debug('=== API: Response Complete ===')
          debug('Finish reason:', finishReason)
          debug('Content length:', fullContent.length)
          debug('Content preview:', fullContent.substring(0, 200))
          debug('Tool calls count:', toolCalls.length)
          if (toolCalls.length > 0) {
            debug('Tool calls:', JSON.stringify(toolCalls, null, 2))
          } else {
            debug('⚠️ No tool calls received from API')
            if (finishReason === 'stop') {
              debug('Model finished with "stop" - it chose not to call tools')
            } else if (finishReason === 'length') {
              debug('Model finished with "length" - response was truncated!')
            } else if (finishReason === 'tool_calls') {
              debug('Model finished with "tool_calls" but no tools parsed - check parsing logic')
            }
          }

          // If there are tool calls, send them as a special message
          if (toolCalls.length > 0) {
            const toolCallsData = toolCalls.map(tc => ({
              id: tc.id,
              name: tc.name,
              arguments: tc.arguments,
            }))
            // Send tool calls as a special JSON block
            controller.enqueue(encoder.encode(`\n<!--TOOL_CALLS:${JSON.stringify(toolCallsData)}-->`))
          }

          controller.close()
        } catch (error) {
          debug('Stream error:', error)
          controller.error(error)
        }
      },
    })

    return new Response(readableStream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Transfer-Encoding': 'chunked',
      },
    })
  } catch (error) {
    console.error('Chat API error:', error)
    return new Response('Internal Server Error', { status: 500 })
  }
}
