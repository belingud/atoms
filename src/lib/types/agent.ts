export interface Agent {
  id: string
  name: string
  nameEn: string
  icon: string // lucide icon name
  description: string
  systemPrompt: string
  tools: string[] // allowed tool names
  color: string // theme color for UI
}

export type AgentId = 'leader' | 'pm' | 'engineer' | 'analyst' | 'seo'
