'use client'

import { cn } from '@/lib/utils'
import { getAgent } from '@/lib/agents/config'
import {
  Crown,
  ClipboardList,
  Code2,
  Layers,
  BarChart3,
  Globe,
} from 'lucide-react'

// Map icon names to components
const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Crown,
  ClipboardList,
  Code2,
  Layers,
  BarChart3,
  Globe,
}

interface AgentBadgeProps {
  agentId: string
  size?: 'sm' | 'md'
  showName?: boolean
  className?: string
}

export function AgentBadge({ agentId, size = 'sm', showName = true, className }: AgentBadgeProps) {
  const agent = getAgent(agentId)
  const IconComponent = ICON_MAP[agent.icon]

  const iconSize = size === 'sm' ? 'h-3 w-3' : 'h-4 w-4'
  const textSize = size === 'sm' ? 'text-xs' : 'text-sm'

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium',
        textSize,
        className
      )}
      style={{
        backgroundColor: `${agent.color}15`,
        color: agent.color,
      }}
    >
      {IconComponent && <IconComponent className={iconSize} />}
      {showName && <span>{agent.name}</span>}
    </span>
  )
}

interface AgentAvatarProps {
  agentId: string
  className?: string
}

export function AgentAvatar({ agentId, className }: AgentAvatarProps) {
  const agent = getAgent(agentId)
  const IconComponent = ICON_MAP[agent.icon]

  return (
    <div
      className={cn(
        'flex items-center justify-center h-8 w-8 rounded-full shrink-0',
        className
      )}
      style={{
        backgroundColor: `${agent.color}20`,
        color: agent.color,
      }}
    >
      {IconComponent && <IconComponent className="h-4 w-4" />}
    </div>
  )
}
