import type { AgentId } from '@/lib/types/agent'
import { AGENTS, DEFAULT_AGENT_ID } from '@/lib/agents/config'

export interface ParsedInput {
  agentId: AgentId
  content: string // content with @mention removed
  mentions: AgentId[] // all mentioned agents
}

// Mapping of names/aliases to agent IDs
const MENTION_MAP: Record<string, AgentId> = {
  // Chinese names
  '团队领导': 'leader',
  '产品经理': 'pm',
  '工程师': 'engineer',
  '数据分析师': 'analyst',
  'SEO专家': 'seo',
  'seo专家': 'seo',
  // Chinese aliases
  '领导': 'leader',
  '开发': 'engineer',
  '分析师': 'analyst',
  // English names (case-insensitive handled in parsing)
  'leader': 'leader',
  'pm': 'pm',
  'engineer': 'engineer',
  'analyst': 'analyst',
  'seo': 'seo',
  // English aliases
  'teamleader': 'leader',
  'team leader': 'leader',
  'product manager': 'pm',
  'dev': 'engineer',
  'developer': 'engineer',
}

// Build regex pattern from all mention names
const mentionNames = Object.keys(MENTION_MAP)
  .sort((a, b) => b.length - a.length) // longest first for greedy matching
  .map(name => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  .join('|')

const MENTION_REGEX = new RegExp(`@(${mentionNames})`, 'gi')

/**
 * Parse @mentions from user input text.
 * Returns the primary agent to route to, cleaned content, and all mentions.
 */
export function parseMentions(input: string): ParsedInput {
  const mentions: AgentId[] = []
  let match: RegExpExecArray | null

  // Find all @mentions
  const regex = new RegExp(MENTION_REGEX.source, 'gi')
  while ((match = regex.exec(input)) !== null) {
    const name = match[1].toLowerCase()
    // Find in map (case-insensitive)
    const agentId = Object.entries(MENTION_MAP).find(
      ([key]) => key.toLowerCase() === name
    )?.[1]
    if (agentId && !mentions.includes(agentId)) {
      mentions.push(agentId)
    }
  }

  // Remove all @mentions from content
  const content = input.replace(MENTION_REGEX, '').trim()

  // First mention determines the primary agent; default to engineer
  const agentId = mentions.length > 0 ? mentions[0] : DEFAULT_AGENT_ID

  return { agentId, content, mentions }
}

/**
 * Check if input starts with @ (for triggering autocomplete)
 */
export function getPartialMention(input: string, cursorPosition: number): string | null {
  // Look backwards from cursor to find @
  const beforeCursor = input.slice(0, cursorPosition)
  const atMatch = beforeCursor.match(/@([^\s@]*)$/)
  return atMatch ? atMatch[1] : null
}

/**
 * Get agent suggestions matching a partial name
 */
export function getAgentSuggestions(partial: string): AgentId[] {
  if (!partial && partial !== '') return []

  const lower = partial.toLowerCase()
  const matched = new Set<AgentId>()

  for (const [name, agentId] of Object.entries(MENTION_MAP)) {
    if (name.toLowerCase().startsWith(lower) || name.toLowerCase().includes(lower)) {
      matched.add(agentId)
    }
  }

  // Also match against agent display names
  for (const agent of Object.values(AGENTS)) {
    const id = agent.id as AgentId
    if (
      agent.name.toLowerCase().includes(lower) ||
      agent.nameEn.toLowerCase().includes(lower) ||
      agent.id.toLowerCase().includes(lower)
    ) {
      matched.add(id)
    }
  }

  return Array.from(matched)
}

/**
 * Replace partial @mention with full mention in input
 */
export function completeMention(
  input: string,
  cursorPosition: number,
  agentId: AgentId
): { text: string; newCursorPosition: number } {
  const beforeCursor = input.slice(0, cursorPosition)
  const afterCursor = input.slice(cursorPosition)

  // Find the @ position
  const atMatch = beforeCursor.match(/@([^\s@]*)$/)
  if (!atMatch) return { text: input, newCursorPosition: cursorPosition }

  const atStart = beforeCursor.length - atMatch[0].length
  const agent = AGENTS[agentId]
  const mention = `@${agent.name} `

  const text = beforeCursor.slice(0, atStart) + mention + afterCursor
  const newCursorPosition = atStart + mention.length

  return { text, newCursorPosition }
}
