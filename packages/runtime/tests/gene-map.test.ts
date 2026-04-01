import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { GeneMap } from '../src/gene/map.js'
import { existsSync, unlinkSync } from 'fs'

const TEST_DB = './test-gene.db'

describe('GeneMap', () => {
  let geneMap: GeneMap

  beforeEach(() => {
    geneMap = new GeneMap(TEST_DB)
  })

  afterEach(() => {
    geneMap.close()
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB)
    if (existsSync(`${TEST_DB}-wal`)) unlinkSync(`${TEST_DB}-wal`)
    if (existsSync(`${TEST_DB}-shm`)) unlinkSync(`${TEST_DB}-shm`)
  })

  it('records a capsule and creates a gene', () => {
    geneMap.recordCapsule({
      sessionId: 'test-session',
      toolName: 'heal',
      input: '{"error":"nonce too low"}',
      output: '{"success":true}',
      success: true,
      errorType: 'nonce_error',
      repairStrategy: 'increment_nonce',
      durationMs: 120,
    })

    const genes = geneMap.list()
    expect(genes.length).toBeGreaterThan(0)
    expect(genes[0].failureCode).toBe('nonce_error')
    expect(genes[0].strategy).toBe('increment_nonce')
  })

  it('increases q-value on repeated success', () => {
    for (let i = 0; i < 5; i++) {
      geneMap.recordCapsule({
        sessionId: `session-${i}`,
        toolName: 'heal',
        input: '{}',
        output: '{}',
        success: true,
        errorType: 'gas_error',
        repairStrategy: 'increase_gas_limit',
        durationMs: 100,
      })
    }

    const best = geneMap.getBestStrategy('gas_error')
    expect(best).not.toBeNull()
    expect(best!.qValue).toBeGreaterThan(0.7)
  })

  it('returns best strategy for known failure', () => {
    geneMap.recordCapsule({
      sessionId: 'session-1',
      toolName: 'heal',
      input: '{}',
      output: '{}',
      success: true,
      errorType: 'nonce_error',
      repairStrategy: 'fetch_current_nonce',
      durationMs: 80,
    })

    const best = geneMap.getBestStrategy('nonce_error')
    expect(best).not.toBeNull()
    expect(best!.strategy).toBe('fetch_current_nonce')
  })

  it('tracks shouldDream threshold', () => {
    expect(geneMap.shouldDream(2)).toBe(false)

    for (let i = 0; i < 3; i++) {
      geneMap.recordCapsule({
        sessionId: `s${i}`,
        toolName: 'test',
        input: '{}',
        output: '{}',
        success: true,
        durationMs: 50,
      })
    }

    expect(geneMap.shouldDream(2)).toBe(true)
  })
})
