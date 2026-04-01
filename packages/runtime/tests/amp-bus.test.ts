import { describe, it, expect } from 'vitest'
import { AMPBus } from '../src/amp/bus.js'

describe('AMPBus', () => {
  it('creates a session and publishes messages', async () => {
    const bus = new AMPBus()
    const session = bus.createSession('Fix payment bug', ['code', 'review'], 50_000)

    await bus.publish(session.id, 'code', 'all', 'proposal',
      'I will fix the nonce error in transaction.ts', { confidence: 0.9 })

    await bus.publish(session.id, 'review', 'code', 'support',
      'Approved — looks like the right approach', { confidence: 0.85 })

    const messages = bus.getMessages(session.id)
    expect(messages.length).toBe(2)
    expect(messages[0].from).toBe('code')
    expect(messages[0].type).toBe('proposal')
    expect(messages[1].from).toBe('review')
    expect(messages[1].type).toBe('support')
  })

  it('triggers budget alert when exceeded', async () => {
    const bus = new AMPBus()
    const session = bus.createSession('test', ['code'], 100)

    const alerts: string[] = []
    bus.subscribe(session.id, 'all', (msg) => {
      if (msg.type === 'budget_alert') alerts.push(msg.content)
    })

    await bus.publish(session.id, 'code', 'all', 'proposal',
      'expensive message', { tokenCost: 150 })

    expect(alerts.length).toBe(1)
    expect(alerts[0]).toContain('Budget exceeded')
  })

  it('routes messages to specific agents', async () => {
    const bus = new AMPBus()
    const session = bus.createSession('test', ['code', 'review'], 10_000)

    const received: string[] = []
    bus.subscribe(session.id, 'review', (msg) => received.push(msg.content))

    await bus.publish(session.id, 'code', 'review', 'question', 'Is this safe?')
    await bus.publish(session.id, 'code', 'chair', 'status', 'Working on it')

    expect(received.length).toBe(1)
    expect(received[0]).toBe('Is this safe?')
  })
})
