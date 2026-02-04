import { OpenAI } from 'openai'
import { createClient } from '@/lib/supabase/server'

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

export async function POST(request: Request) {
  try {
    // Verify authentication
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return new Response('Unauthorized', { status: 401 })
    }

    const { message } = await request.json()

    if (!message) {
      return new Response('Missing message', { status: 400 })
    }

    const openai = getOpenAIClient()

    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_SMALL_MODEL || process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: '你是一个项目命名助手。根据用户描述的需求，生成一个简短的项目名称（2-4个中文词或英文单词）。只输出项目名称，不要任何其他内容。'
        },
        {
          role: 'user',
          content: message
        }
      ],
      max_tokens: 50,
    })

    const name = response.choices[0]?.message?.content?.trim() || '新项目'

    return new Response(JSON.stringify({ name }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('Generate name error:', error)
    return new Response('Internal Server Error', { status: 500 })
  }
}
