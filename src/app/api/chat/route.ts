import { OpenAI } from 'openai'
import { createClient } from '@/lib/supabase/server'

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

const SYSTEM_PROMPT = `You are an expert full-stack developer AI assistant. You help users build web applications by generating high-quality code.

## Code Generation Guidelines
1. Use modern best practices and clean code principles
2. Use TypeScript for type safety
3. Follow the project's existing patterns and conventions
4. Include brief comments only for complex logic

## Project Structure
When generating a React application, use this standard structure:
- src/App.tsx - Main application component (REQUIRED)
- src/components/*.tsx - Reusable components
- src/hooks/*.ts - Custom hooks
- src/utils/*.ts - Utility functions
- src/types/*.ts - TypeScript types

## Tools Available
You have access to the following tools:

### File Operations
- write_file: Write or update a file in the project
- read_file: Read the content of a file
- list_directory: List files and directories in a path
- search_files: Search for files by name pattern

### Execution
- run_command: Execute shell commands (but NOT npm install - use run_preview instead)
- run_preview: Start or restart the preview server (automatically handles npm install)

## IMPORTANT: Tool Usage Rules
1. **Only use tools that are necessary** to answer the user's question
2. **NEVER run npm install manually** - run_preview handles this automatically
3. **After writing files, call run_preview** to start the app - it will install dependencies and start the dev server
4. **Answer questions directly** when possible without using tools

## Response Guidelines
1. Be concise and direct
2. Only use necessary tools
3. Explain what you did briefly
4. Don't be overly proactive - do what the user asks, not more

Focus on generating working code.`

// Define tools for OpenAI function calling
const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: 'Write or update a file in the project. Use this to create new files or modify existing ones.',
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
  {
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
  {
    type: 'function',
    function: {
      name: 'list_directory',
      description: 'List all files and directories in a given path.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'The directory path to list, e.g., src or src/components. Use empty string for root.',
          },
        },
        required: ['path'],
      },
    },
  },
  {
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
  {
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
  {
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
]

export async function POST(request: Request) {
  try {
    // Verify authentication
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return new Response('Unauthorized', { status: 401 })
    }

    const { messages, projectId } = await request.json()

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

    const openai = getOpenAIClient()

    debug('\n=== API: Chat Request ===')
    debug('Model:', process.env.OPENAI_MODEL || 'gpt-4o')
    debug('Messages count:', messages.length)

    // Create streaming response with tools
    const stream = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        ...messages,
      ],
      tools,
      tool_choice: 'auto',
      stream: true,
    })

    // Handle streaming response with tool calls
    const encoder = new TextEncoder()
    let toolCalls: { id: string; name: string; arguments: string }[] = []
    let fullContent = ''

    const readableStream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            const delta = chunk.choices[0]?.delta

            // Handle text content
            if (delta?.content) {
              fullContent += delta.content
              controller.enqueue(encoder.encode(delta.content))
            }

            // Handle tool calls
            if (delta?.tool_calls) {
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
          debug('Content length:', fullContent.length)
          debug('Content preview:', fullContent.substring(0, 200))
          debug('Tool calls count:', toolCalls.length)
          if (toolCalls.length > 0) {
            debug('Tool calls:', JSON.stringify(toolCalls, null, 2))
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
