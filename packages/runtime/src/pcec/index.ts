import { Perceive, type FailureContext } from './perceive.js'
import { Construct } from './construct.js'
import { Evaluate } from './evaluate.js'
import { Commit } from './commit.js'
import type { GeneMap } from '../gene/map.js'

export interface PCECConfig {
  maxRetries?: number
  geneMap: GeneMap
}

export interface PCECResult {
  success: boolean
  attempts: number
  finalStrategy: string
  escalated: boolean
}

export class PCEC {
  private perceive: Perceive
  private construct: Construct
  private evaluate: Evaluate
  private commit: Commit
  private maxRetries: number

  constructor(config: PCECConfig) {
    this.perceive = new Perceive(config.geneMap)
    this.construct = new Construct(config.geneMap)
    this.evaluate = new Evaluate()
    this.commit = new Commit(config.geneMap)
    this.maxRetries = config.maxRetries ?? 3
  }

  async repair(
    failure: FailureContext,
    execute: (strategy: string, params: Record<string, unknown>) => Promise<{ success: boolean; output: string }>
  ): Promise<PCECResult> {
    let attempt = 0

    while (attempt < this.maxRetries) {
      const start = Date.now()

      // P: Perceive
      const perception = await this.perceive.analyze(failure)
      console.log(`[PCEC] Perceive: ${perception.failureCode} (${perception.severity})`)

      // C: Construct
      const strategies = await this.construct.generate(perception)
      console.log(`[PCEC] Construct: ${strategies.length} strategies`)

      // E: Evaluate
      const evaluation = await this.evaluate.score(strategies, perception, attempt)
      console.log(`[PCEC] Evaluate: ${evaluation.bestStrategy.name} (${Math.round(evaluation.score * 100)}%)`)

      if (evaluation.shouldEscalate) {
        return { success: false, attempts: attempt + 1, finalStrategy: 'escalate', escalated: true }
      }

      // C: Commit (execute + record)
      const outcome = await execute(evaluation.bestStrategy.name, evaluation.bestStrategy.params)
      await this.commit.apply(evaluation, failure.sessionId, {
        ...outcome,
        durationMs: Date.now() - start,
      })

      if (outcome.success) {
        console.log(`[PCEC] ✓ Repaired on attempt ${attempt + 1}`)
        return {
          success: true,
          attempts: attempt + 1,
          finalStrategy: evaluation.bestStrategy.name,
          escalated: false,
        }
      }

      attempt++
      // Update failure context for next attempt
      failure = { ...failure, turnCount: failure.turnCount + 1 }
    }

    return { success: false, attempts: attempt, finalStrategy: 'max_retries_exceeded', escalated: true }
  }
}
