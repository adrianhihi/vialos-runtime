import { randomUUID } from 'crypto'
import type { AMPMessage, AMPMessageType, AgentRole, AMPSession } from './protocol.js'

type MessageHandler = (message: AMPMessage) => void | Promise<void>

export class AMPBus {
  private sessions = new Map<string, AMPSession>()
  private handlers = new Map<string, MessageHandler[]>()

  createSession(objective: string, participants: AgentRole[], budget: number = 100_000): AMPSession {
    const session: AMPSession = {
      id: randomUUID(),
      objective,
      status: 'scheduled',
      participants,
      messages: [],
      startedAt: Date.now(),
      totalTokens: 0,
      budget,
    }
    this.sessions.set(session.id, session)
    return session
  }

  async publish(
    sessionId: string,
    from: AgentRole,
    to: AgentRole | 'all',
    type: AMPMessageType,
    content: string,
    options: Partial<Pick<AMPMessage, 'confidence' | 'evidence' | 'references' | 'tokenCost' | 'geneIds'>> = {}
  ): Promise<AMPMessage> {
    const session = this.sessions.get(sessionId)
    if (!session) throw new Error(`Session ${sessionId} not found`)

    const message: AMPMessage = {
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      from,
      to,
      sessionId,
      type,
      content,
      confidence: options.confidence ?? 0.8,
      evidence: options.evidence,
      references: options.references,
      tokenCost: options.tokenCost,
      geneIds: options.geneIds,
      signature: this.sign(from, content),
    }

    session.messages.push(message)
    if (options.tokenCost) session.totalTokens += options.tokenCost

    // Check budget (skip for budget_alert to avoid infinite recursion)
    if (type !== 'budget_alert' && session.totalTokens > session.budget) {
      await this.publish(sessionId, 'budget', 'all', 'budget_alert',
        `Budget exceeded: ${session.totalTokens}/${session.budget} tokens used`)
    }

    // Notify handlers
    const key = `${sessionId}:${to}`
    const allKey = `${sessionId}:all`
    const handlers = to === 'all'
      ? [...(this.handlers.get(allKey) ?? [])]
      : [
          ...(this.handlers.get(key) ?? []),
          ...(this.handlers.get(allKey) ?? []),
        ]
    await Promise.all(handlers.map(h => h(message)))

    return message
  }

  subscribe(sessionId: string, agentRole: AgentRole, handler: MessageHandler): () => void {
    const key = `${sessionId}:${agentRole}`
    if (!this.handlers.has(key)) this.handlers.set(key, [])
    this.handlers.get(key)!.push(handler)

    return () => {
      const handlers = this.handlers.get(key) ?? []
      this.handlers.set(key, handlers.filter(h => h !== handler))
    }
  }

  getSession(sessionId: string): AMPSession | undefined {
    return this.sessions.get(sessionId)
  }

  getMessages(sessionId: string, filter?: { from?: AgentRole; type?: AMPMessageType }): AMPMessage[] {
    const session = this.sessions.get(sessionId)
    if (!session) return []

    return session.messages.filter(m => {
      if (filter?.from && m.from !== filter.from) return false
      if (filter?.type && m.type !== filter.type) return false
      return true
    })
  }

  private sign(from: AgentRole, content: string): string {
    // Simple signature for now — replace with crypto signing in production
    return Buffer.from(`${from}:${content.slice(0, 32)}`).toString('base64')
  }
}
