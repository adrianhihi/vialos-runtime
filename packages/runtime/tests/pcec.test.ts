import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { PCEC } from '../src/pcec/index.js'
import { GeneMap } from '../src/gene/map.js'
import { existsSync, unlinkSync } from 'fs'

const TEST_DB = './test-pcec.db'

describe('PCEC', () => {
  let geneMap: GeneMap
  let pcec: PCEC

  beforeEach(() => {
    geneMap = new GeneMap(TEST_DB)
    pcec = new PCEC({ geneMap, maxRetries: 3 })
  })

  afterEach(() => {
    geneMap.close()
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB)
    if (existsSync(`${TEST_DB}-wal`)) unlinkSync(`${TEST_DB}-wal`)
    if (existsSync(`${TEST_DB}-shm`)) unlinkSync(`${TEST_DB}-shm`)
  })

  it('repairs a nonce error on first attempt', async () => {
    const result = await pcec.repair(
      {
        errorType: 'nonce_error',
        errorMessage: 'nonce too low: expected 42, got 40',
        toolName: 'eth_sendTransaction',
        turnCount: 1,
        sessionId: 'test-session',
      },
      async (strategy) => ({
        success: strategy === 'increment_nonce' || strategy === 'fetch_current_nonce',
        output: 'Transaction sent successfully',
      })
    )

    expect(result.success).toBe(true)
    expect(result.attempts).toBe(1)
    expect(result.escalated).toBe(false)
  })

  it('escalates after max retries', async () => {
    const result = await pcec.repair(
      {
        errorType: 'unknown_error',
        errorMessage: 'catastrophic failure',
        toolName: 'test',
        turnCount: 1,
        sessionId: 'test-session',
      },
      async () => ({ success: false, output: 'still failing' })
    )

    expect(result.success).toBe(false)
    expect(result.escalated).toBe(true)
  })

  it('uses gene map knowledge on second run', async () => {
    // First run: record a successful repair
    await pcec.repair(
      {
        errorType: 'gas_error',
        errorMessage: 'gas too low',
        toolName: 'eth_sendTransaction',
        turnCount: 1,
        sessionId: 'session-1',
      },
      async (strategy) => ({
        success: strategy === 'increase_gas_limit',
        output: 'ok',
      })
    )

    // Second run: should use gene map to pick best strategy
    const result = await pcec.repair(
      {
        errorType: 'gas_error',
        errorMessage: 'gas too low again',
        toolName: 'eth_sendTransaction',
        turnCount: 1,
        sessionId: 'session-2',
      },
      async (strategy) => ({
        success: strategy === 'increase_gas_limit',
        output: 'ok',
      })
    )

    expect(result.success).toBe(true)
  })
})
