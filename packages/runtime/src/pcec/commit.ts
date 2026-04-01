import type { EvaluationResult } from './evaluate.js'
import type { GeneMap } from '../gene/map.js'

export interface CommitResult {
  success: boolean
  strategyApplied: string
  capsuleId: string
  message: string
}

export class Commit {
  constructor(private geneMap: GeneMap) {}

  async apply(
    evaluation: EvaluationResult,
    sessionId: string,
    outcome: { success: boolean; output: string; durationMs: number }
  ): Promise<CommitResult> {
    // Record to Gene Map
    const capsuleId = this.geneMap.recordCapsule({
      sessionId,
      toolName: 'pcec_repair',
      input: JSON.stringify({
        strategy: evaluation.bestStrategy.name,
        params: evaluation.bestStrategy.params,
      }),
      output: outcome.output,
      success: outcome.success,
      errorType: evaluation.bestStrategy.params.failureCode as string,
      repairStrategy: evaluation.bestStrategy.name,
      durationMs: outcome.durationMs,
    })

    return {
      success: outcome.success,
      strategyApplied: evaluation.bestStrategy.name,
      capsuleId,
      message: outcome.success
        ? `✓ Repair succeeded: ${evaluation.bestStrategy.name}`
        : `✗ Repair failed: ${evaluation.bestStrategy.name} — will retry`,
    }
  }
}
