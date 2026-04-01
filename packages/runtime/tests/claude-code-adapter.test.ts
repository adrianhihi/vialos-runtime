import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { ClaudeCodeAdapter } from '../src/adapters/claude-code.js'
import { existsSync, unlinkSync } from 'fs'

const TEST_DB = './test-adapter.db'

describe('ClaudeCodeAdapter', () => {
  let adapter: ClaudeCodeAdapter

  beforeEach(() => {
    adapter = new ClaudeCodeAdapter({
      geneMapPath: TEST_DB,
      maxRetries: 3,
      verbose: false,
    })
  })

  afterEach(() => {
    adapter.close()
    for (const f of [TEST_DB, `${TEST_DB}-wal`, `${TEST_DB}-shm`]) {
      if (existsSync(f)) unlinkSync(f)
    }
  })

  it('runs executor and returns result on success', async () => {
    const result = await adapter.run(
      { prompt: 'Fix the payment transaction' },
      async (prompt, ctx) => ({
        output: `Fixed: ${prompt}`,
        success: true,
      })
    )

    expect(result.success).toBe(true)
    expect(result.vialAttempts).toBe(1)
    expect(result.vialEscalated).toBe(false)
    expect(result.sessionId).toBeTruthy()
  })

  it('retries on failure and escalates after max retries', async () => {
    let attempts = 0
    const result = await adapter.run(
      { prompt: 'Do something impossible' },
      async () => {
        attempts++
        return { output: '', success: false, error: 'always fails' }
      }
    )

    expect(result.success).toBe(false)
    expect(result.vialEscalated).toBe(true)
    expect(attempts).toBeGreaterThan(1)
  })

  it('injects gene context into executor on second run', async () => {
    // First run — seeds Gene Map
    await adapter.run(
      { prompt: 'fix nonce error' },
      async (_prompt, ctx) => ({
        output: 'fixed',
        success: true,
      })
    )

    // Second run — should have gene context
    let receivedContext: Record<string, unknown> = {}
    await adapter.run(
      { prompt: 'fix nonce error again' },
      async (_prompt, ctx) => {
        receivedContext = ctx
        return { output: 'fixed', success: true }
      }
    )

    expect(receivedContext.sessionId).toBeTruthy()
    expect(receivedContext.vialStrategy).toBeTruthy()
  })

  it('exposes gene map directly', () => {
    const geneMap = adapter.getGeneMap()
    expect(geneMap).toBeTruthy()
    expect(geneMap.list()).toBeInstanceOf(Array)
  })
})
