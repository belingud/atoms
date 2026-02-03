import { create } from 'zustand'
import { createClient } from '@/lib/supabase/client'
import type { Message } from '@/lib/types/database'
import { parseFilesFromResponse, usePreviewStore } from './preview-store'

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  isStreaming?: boolean
}

interface ChatState {
  messages: ChatMessage[]
  isLoading: boolean
  error: string | null

  fetchMessages: (projectId: string) => Promise<void>
  sendMessage: (projectId: string, content: string) => Promise<void>
  clearMessages: () => void
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

      const messages: ChatMessage[] = (data || []).map((m: Message) => ({
        id: m.id,
        role: m.role,
        content: m.content,
      }))

      set({ messages, isLoading: false })
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false })
    }
  },

  sendMessage: async (projectId: string, content: string) => {
    const userMessageId = crypto.randomUUID()
    const assistantMessageId = crypto.randomUUID()

    // Add user message immediately
    set((state) => ({
      messages: [
        ...state.messages,
        { id: userMessageId, role: 'user' as const, content },
      ],
      isLoading: true,
      error: null,
    }))

    // Add placeholder for assistant message
    set((state) => ({
      messages: [
        ...state.messages,
        { id: assistantMessageId, role: 'assistant' as const, content: '', isStreaming: true },
      ],
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

      // Call AI API with streaming
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          messages: get().messages.filter(m => !m.isStreaming).map(m => ({
            role: m.role,
            content: m.content,
          })),
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to get AI response')
      }

      const reader = response.body?.getReader()
      const decoder = new TextDecoder()
      let assistantContent = ''

      if (reader) {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          const chunk = decoder.decode(value)
          assistantContent += chunk

          // Update assistant message with streamed content
          set((state) => ({
            messages: state.messages.map((m) =>
              m.id === assistantMessageId
                ? { ...m, content: assistantContent }
                : m
            ),
          }))
        }
      }

      // Mark streaming as complete
      set((state) => ({
        messages: state.messages.map((m) =>
          m.id === assistantMessageId
            ? { ...m, isStreaming: false }
            : m
        ),
        isLoading: false,
      }))

      // Save assistant message to database
      await supabase.from('messages').insert({
        id: assistantMessageId,
        project_id: projectId,
        role: 'assistant',
        content: assistantContent,
      })

      // Parse and save files from AI response
      const parsedFiles = parseFilesFromResponse(assistantContent)
      if (parsedFiles.length > 0) {
        const previewStore = usePreviewStore.getState()
        for (const file of parsedFiles) {
          await previewStore.saveFile(projectId, file.path, file.content)
        }
        // Refresh files list
        await previewStore.fetchFiles(projectId)
      }
    } catch (error) {
      set((state) => ({
        messages: state.messages.filter((m) => m.id !== assistantMessageId),
        error: (error as Error).message,
        isLoading: false,
      }))
    }
  },

  clearMessages: () => {
    set({ messages: [], error: null })
  },
}))
