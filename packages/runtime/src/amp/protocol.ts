export type AgentRole =
  | 'chair' | 'secretary' | 'escalation' | 'budget'
  | 'code' | 'review' | 'test' | 'security' | 'devops'
  | 'incident' | 'sre' | 'db-optimizer'
  | 'intel' | 'learning' | 'gene-curator'
  | 'product' | 'feedback'
  | 'finance' | 'executive-summary' | 'legal'
  | 'memory' | 'observability' | 'identity' | 'conflict'
  | string

export type AMPMessageType =
  | 'proposal'
  | 'challenge'
  | 'support'
  | 'question'
  | 'answer'
  | 'vote'
  | 'decision'
  | 'action_item'
  | 'status'
  | 'escalate'
  | 'budget_alert'
  | 'denial_feedback'
  | 'briefing'

export interface AMPMessage {
  id: string
  timestamp: string           // ISO 8601
  from: AgentRole
  to: AgentRole | 'all'
  sessionId: string
  type: AMPMessageType
  content: string
  confidence: number          // 0-1
  evidence?: string[]
  references?: string[]       // referenced message IDs
  tokenCost?: number
  geneIds?: string[]
  signature: string
}

export interface AMPSession {
  id: string
  objective: string
  status: 'scheduled' | 'opening' | 'briefing' | 'discussion' | 'vote' | 'decision' | 'execution' | 'closing' | 'dream'
  participants: AgentRole[]
  messages: AMPMessage[]
  startedAt: number
  endedAt?: number
  totalTokens: number
  budget: number              // max tokens for this session
}
