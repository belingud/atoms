'use client'

import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { getAgentSuggestions } from '@/lib/utils/mention-parser'
import { getAgent } from '@/lib/agents/config'
import type { AgentId } from '@/lib/types/agent'
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
      className="absolute z-50 w-64 rounded-lg border border-gray-200 bg-white shadow-lg overflow-hidden"
      style={position ? { bottom: position.top, left: position.left } : { bottom: '100%', left: 0 }}
    >
      <div className="px-3 py-1.5 text-xs text-muted-foreground border-b border-gray-100">
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
                'flex items-center gap-2.5 w-full px-3 py-2 text-left text-sm hover:bg-gray-50 transition-colors',
                index === selectedIndex && 'bg-gray-50'
              )}
              onClick={() => onSelect(agentId)}
              onMouseEnter={() => setSelectedIndex(index)}
            >
              <div
                className="flex items-center justify-center h-7 w-7 rounded-full shrink-0"
                style={{ backgroundColor: `${agent.color}15`, color: agent.color }}
              >
                {IconComponent && <IconComponent className="h-3.5 w-3.5" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-gray-900">{agent.name}</div>
                <div className="text-xs text-muted-foreground truncate">{agent.description}</div>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
