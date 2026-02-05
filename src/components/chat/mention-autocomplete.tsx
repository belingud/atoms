'use client'

import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { getAgentSuggestions } from '@/lib/utils/mention-parser'
import { getAgent } from '@/lib/agents/config'
import type { AgentId } from '@/lib/types/agent'
import { AgentAvatar } from './agent-badge'
import {
  Crown,
  ClipboardList,
  Code2,
  Layers,
  BarChart3,
  Globe,
} from 'lucide-react'

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Crown,
  ClipboardList,
  Code2,
  Layers,
  BarChart3,
  Globe,
}

interface MentionAutocompleteProps {
  partial: string // partial text after @
  onSelect: (agentId: AgentId) => void
  onClose: () => void
  position?: { top: number; left: number }
}

export function MentionAutocomplete({ partial, onSelect, onClose, position }: MentionAutocompleteProps) {
  const [selectedIndex, setSelectedIndex] = useState(0)
  const ref = useRef<HTMLDivElement>(null)
  const suggestions = getAgentSuggestions(partial)

  // Reset selection when suggestions change
  useEffect(() => {
    setSelectedIndex(0)
  }, [partial])

  // Close on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  // Handle keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (suggestions.length === 0) return

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          setSelectedIndex(i => (i + 1) % suggestions.length)
          break
        case 'ArrowUp':
          e.preventDefault()
          setSelectedIndex(i => (i - 1 + suggestions.length) % suggestions.length)
          break
        case 'Enter':
        case 'Tab':
          e.preventDefault()
          onSelect(suggestions[selectedIndex])
          break
        case 'Escape':
          e.preventDefault()
          onClose()
          break
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [suggestions, selectedIndex, onSelect, onClose])

  if (suggestions.length === 0) return null

  return (
    <div
      ref={ref}
      className="absolute z-50 w-72 rounded-xl border border-gray-200/80 bg-white shadow-2xl shadow-gray-900/10 overflow-hidden backdrop-blur-sm"
      style={position ? { bottom: position.top, left: position.left } : { bottom: '100%', left: 0 }}
    >
      <div className="px-3 py-2 text-xs font-medium text-gray-500 bg-gray-50/80 border-b border-gray-100">
        选择 Agent
      </div>
      <div className="py-1">
        {suggestions.map((agentId, index) => {
          const agent = getAgent(agentId)
          const IconComponent = ICON_MAP[agent.icon]
          return (
            <button
              key={agentId}
              className={cn(
                'flex items-center gap-3 w-full px-3 py-2.5 text-left text-sm transition-all duration-150',
                index === selectedIndex
                  ? 'bg-gradient-to-r from-blue-50 to-indigo-50/50'
                  : 'hover:bg-gray-50'
              )}
              onClick={() => onSelect(agentId)}
              onMouseEnter={() => setSelectedIndex(index)}
            >
              <AgentAvatar agentId={agentId} />
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-gray-900">{agent.name}</div>
                <div className="text-xs text-gray-500 truncate">{agent.description}</div>
              </div>
              {index === selectedIndex && (
                <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
