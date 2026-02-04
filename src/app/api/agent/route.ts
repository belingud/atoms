import { OpenAI } from 'openai'
import { createClient } from '@/lib/supabase/server'
import { getAgent } from '@/lib/agents/config'

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

/**
 * Internal API for team leader delegation.
 * Called by the client when leader's delegate_task tool is executed.
 * Returns a non-streaming JSON response with the delegated agent's result.
 */
export async function POST(request: Request) {
  try {
    // Verify authentication
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return new Response('Unauthorized', { status: 401 })
    }

    const { agentId, task, projectId, context } = await request.json()

    if (!agentId || !task || !projectId) {
      return new Response('Missing required fields: agentId, task, projectId', { status: 400 })
    }

    // Prevent delegation loops - cannot delegate to leader
    if (agentId === 'leader') {
      return Response.json({
        agentId,
        result: '错误: 不能委派任务给团队领导自己',
      })
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

    const agent = getAgent(agentId)
    const openai = getOpenAIClient()

    debug(`\n=== Agent Delegation: ${agentId} (${agent.name}) ===`)
    debug('Task:', task)

    // Build messages for the delegated agent
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: agent.systemPrompt },
    ]

    // Include context if provided
    if (context) {
      messages.push({
        role: 'user',
        content: `以下是项目的相关上下文信息:\n${context}`,
      })
    }

    messages.push({
      role: 'user',
      content: `团队领导委派给你的任务:\n\n${task}\n\n请完成这个任务并给出你的专业分析和建议。`,
    })

    // Non-streaming call for delegation (simpler result collection)
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o',
      messages,
    })

    const result = completion.choices[0]?.message?.content || '(无响应)'

    debug(`=== Agent ${agentId} Result ===`)
    debug('Result length:', result.length)
    debug('Result preview:', result.substring(0, 200))

    return Response.json({
      agentId,
      agentName: agent.name,
      result,
    })
  } catch (error) {
    console.error('Agent delegation error:', error)
    return new Response('Internal Server Error', { status: 500 })
  }
}
