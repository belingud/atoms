import { create } from 'zustand'
import type { AgentId } from '@/lib/types/agent'
import { DEFAULT_AGENT_ID } from '@/lib/agents/config'

interface AgentState {
  currentAgentId: AgentId
  setCurrentAgent: (id: AgentId) => void
  resetAgent: () => void
}

export const useAgentStore = create<AgentState>((set) => ({
  currentAgentId: DEFAULT_AGENT_ID,
  setCurrentAgent: (id) => set({ currentAgentId: id }),
  resetAgent: () => set({ currentAgentId: DEFAULT_AGENT_ID }),
}))
