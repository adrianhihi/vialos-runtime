import type { RepairStrategy } from './construct.js'
import type { PerceiveResult } from './perceive.js'

export interface EvaluationResult {
  bestStrategy: RepairStrategy
  score: number
  reasoning: string
  shouldEscalate: boolean
}

export class Evaluate {
  async score(
    strategies: RepairStrategy[],
    perception: PerceiveResult,
    attempt: number
  ): Promise<EvaluationResult> {
    if (strategies.length === 0) {
      return {
        bestStrategy: {
          id: 'escalate_fallback',
          name: 'escalate',
          description: 'No strategies available — escalate to human',
          confidence: 1.0,
          params: {},
        },
        score: 0,
        reasoning: 'No repair strategies found',
        shouldEscalate: true,
      }
    }

    // Penalize strategies that have been tried
    const adjusted = strategies.map(s => ({
      ...s,
      confidence: s.confidence * (1 - attempt * 0.15), // Decay per attempt
    }))

    const best = adjusted.sort((a, b) => b.confidence - a.confidence)[0]
    const shouldEscalate = best.confidence < 0.3 || attempt >= 3 || perception.severity === 'critical'

    return {
      bestStrategy: best,
      score: best.confidence,
      reasoning: [
        `Selected: ${best.name} (confidence: ${Math.round(best.confidence * 100)}%)`,
        `Attempt: ${attempt + 1}`,
        `Severity: ${perception.severity}`,
        shouldEscalate ? '⚠ Escalation threshold reached' : '✓ Proceeding with repair',
      ].join('\n'),
      shouldEscalate,
    }
  }
}
