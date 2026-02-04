'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { ArrowUp, Sparkles } from 'lucide-react'
import { useProjectStore } from '@/lib/store/project-store'
import { useChatStore } from '@/lib/store/chat-store'

export function WelcomePage() {
  const [input, setInput] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [isComposing, setIsComposing] = useState(false)
  const { createProject, setActiveProject } = useProjectStore()
  const { sendMessage } = useChatStore()

  const handleSubmit = async () => {
    if (!input.trim() || isCreating) return

    setIsCreating(true)
    try {
      // Generate project name using AI
      const nameResponse = await fetch('/api/generate-name', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: input.trim() }),
      })

      let projectName = '新项目'
      if (nameResponse.ok) {
        const { name } = await nameResponse.json()
        projectName = name
      }

      // Create the project
      const project = await createProject(projectName)
      if (project) {
        setActiveProject(project)
        // Send the initial message
        await sendMessage(project.id, input.trim())
        setInput('')
      }
    } catch (error) {
      console.error('Failed to create project:', error)
    } finally {
      setIsCreating(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && !isComposing) {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-full px-4 py-12">
      {/* Decorative avatars */}
      <div className="flex -space-x-2 mb-6">
        {['🧑‍💻', '👩‍🎨', '🧑‍🔬', '👨‍🚀', '🤖', '🎨', '💡'].map((emoji, i) => (
          <div
            key={i}
            className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-100 to-purple-100 flex items-center justify-center text-lg border-2 border-white shadow-sm"
          >
            {emoji}
          </div>
        ))}
      </div>

      {/* Headline */}
      <h1 className="text-4xl md:text-5xl font-bold text-center mb-4">
        <span className="text-gray-900">把想法变成</span>
        <span className="bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent"> 产品</span>
      </h1>

      {/* Subtitle */}
      <p className="text-gray-500 text-center mb-8 max-w-md">
        AI 助手帮你构建产品。描述你的想法，几分钟内完成。无需编码。
      </p>

      {/* Input area */}
      <div className="w-full max-w-2xl">
        <div className="relative bg-white rounded-2xl shadow-lg border border-gray-200 overflow-hidden">
          <Textarea
            placeholder="描述你想要构建的应用..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onCompositionStart={() => setIsComposing(true)}
            onCompositionEnd={() => setIsComposing(false)}
            className="min-h-[120px] border-0 resize-none focus-visible:ring-0 text-base p-4 pb-14"
            disabled={isCreating}
          />
          <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between">
            <div className="flex items-center gap-2 text-gray-400 text-sm">
              <Sparkles className="h-4 w-4" />
              <span>按 Enter 发送</span>
            </div>
            <Button
              size="icon"
              className="rounded-full h-9 w-9 bg-gray-900 hover:bg-gray-800"
              onClick={handleSubmit}
              disabled={!input.trim() || isCreating}
            >
              <ArrowUp className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Example prompts */}
      <div className="mt-8 flex flex-wrap justify-center gap-2">
        {[
          '创建一个待办事项应用',
          '做一个天气预报网站',
          '设计一个计数器组件',
        ].map((prompt) => (
          <button
            key={prompt}
            onClick={() => setInput(prompt)}
            className="px-4 py-2 text-sm text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-full transition-colors"
          >
            {prompt}
          </button>
        ))}
      </div>
    </div>
  )
}
