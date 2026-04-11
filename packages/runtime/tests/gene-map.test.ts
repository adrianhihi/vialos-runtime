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

  it('excludes poisoned genes (low q_value) from getBestStrategy', () => {
    const geneMap = new GeneMap(':memory:')

    // 3 failures + 1 success on the same (errorType, strategy) pair.
    // updateGene tracks this via success_count=1, failure_count=3,
    // yielding q_value = 1 / (1 + 3) = 0.25 < 0.3 threshold.
    for (let i = 0; i < 3; i++) {
      geneMap.recordCapsule({
        sessionId: `fail-${i}`,
        toolName: 'heal',
        input: '{}',
        output: '{"error":"stf"}',
        success: false,
        errorType: 'stf_error',
        repairStrategy: 'bad_strategy',
        durationMs: 100,
      })
    }
    geneMap.recordCapsule({
      sessionId: 'lucky-success',
      toolName: 'heal',
      input: '{}',
      output: '{"ok":true}',
      success: true,
      errorType: 'stf_error',
      repairStrategy: 'bad_strategy',
      durationMs: 100,
    })

    // Before the fix: getBestStrategy returned this poisoned gene because
    // it only checked success_count > 0. After the fix: q_value 0.25 < 0.3
    // filter excludes it, and we fall back to null (adapter default).
    const result = geneMap.getBestStrategy('stf_error')
    expect(result).toBeNull()

    geneMap.close()
  })

  it('still returns genes with acceptable q_value (boundary case)', () => {
    const geneMap = new GeneMap(':memory:')

    // 1 failure + 1 success → q_value = 1 / (1 + 1) = 0.5, above threshold.
    // This gene should still be returned — we are not over-filtering.
    geneMap.recordCapsule({
      sessionId: 'f1',
      toolName: 'heal',
      input: '{}',
      output: '{"error":"gas"}',
      success: false,
      errorType: 'gas_error',
      repairStrategy: 'bump_gas',
      durationMs: 100,
    })
    geneMap.recordCapsule({
      sessionId: 's1',
      toolName: 'heal',
      input: '{}',
      output: '{"ok":true}',
      success: true,
      errorType: 'gas_error',
      repairStrategy: 'bump_gas',
      durationMs: 100,
    })

    const result = geneMap.getBestStrategy('gas_error')
    expect(result).not.toBeNull()
    expect(result!.strategy).toBe('bump_gas')
    expect(result!.qValue).toBeGreaterThan(0.3)
    expect(result!.qValue).toBeLessThanOrEqual(0.5)

    geneMap.close()
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
