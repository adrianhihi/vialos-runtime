import type { GeneMap, Gene } from '../gene/map.js'

export interface FailureContext {
  errorType: string
  errorMessage: string
  toolName?: string
  turnCount: number
  sessionId: string
  rawMessages?: unknown[]
}

export interface PerceiveResult {
  diagnosis: string
  failureCode: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  relevantGenes: Gene[]
  suggestedStrategies: string[]
}

export class Perceive {
  constructor(private geneMap: GeneMap) {}

  async analyze(failure: FailureContext): Promise<PerceiveResult> {
    const failureCode = this.classifyFailure(failure)
    const relevantGenes = this.geneMap.query({
      errorType: failureCode,
      limit: 5,
    })

    const suggestedStrategies = relevantGenes.length > 0
      ? relevantGenes.map(g => g.strategy)
      : this.defaultStrategies(failureCode)

    return {
      diagnosis: this.buildDiagnosis(failure, relevantGenes),
      failureCode,
      severity: this.assessSeverity(failure),
      relevantGenes,
      suggestedStrategies,
    }
  }

  private classifyFailure(failure: FailureContext): string {
    const msg = failure.errorMessage.toLowerCase()

    // Payment-specific (Helix domain)
    if (msg.includes('nonce')) return 'nonce_error'
    if (msg.includes('gas')) return 'gas_error'
    if (msg.includes('insufficient funds') || msg.includes('balance')) return 'balance_error'
    if (msg.includes('revert')) return 'contract_revert'

    // General agent failures
    if (msg.includes('timeout')) return 'timeout'
    if (msg.includes('rate limit')) return 'rate_limit'
    if (msg.includes('permission')) return 'permission_denied'
    if (msg.includes('not found') || msg.includes('404')) return 'not_found'
    if (msg.includes('context') && msg.includes('long')) return 'context_overflow'

    return `unknown_${failure.toolName ?? 'general'}`
  }

  private assessSeverity(failure: FailureContext): 'low' | 'medium' | 'high' | 'critical' {
    if (failure.turnCount > 10) return 'critical'
    if (failure.errorType.includes('permission')) return 'high'
    if (failure.errorType.includes('balance')) return 'high'
    if (failure.turnCount > 5) return 'medium'
    return 'low'
  }

  private buildDiagnosis(failure: FailureContext, genes: Gene[]): string {
    const parts = [
      `Failure: ${failure.errorType} — ${failure.errorMessage}`,
      `Tool: ${failure.toolName ?? 'unknown'}`,
      `Turn: ${failure.turnCount}`,
    ]

    if (genes.length > 0) {
      const best = genes[0]
      parts.push(`Historical match: ${best.failureCode} (success rate: ${Math.round(best.qValue * 100)}%)`)
      parts.push(`Best known strategy: ${best.strategy}`)
    } else {
      parts.push('No historical data — attempting default strategies')
    }

    return parts.join('\n')
  }

  private defaultStrategies(failureCode: string): string[] {
    const defaults: Record<string, string[]> = {
      nonce_error: ['increment_nonce', 'fetch_current_nonce', 'wait_and_retry'],
      gas_error: ['increase_gas_limit', 'estimate_gas_dynamic', 'use_gas_oracle'],
      balance_error: ['check_balance', 'reduce_amount', 'notify_insufficient_funds'],
      timeout: ['retry_with_backoff', 'reduce_complexity', 'split_task'],
      rate_limit: ['exponential_backoff', 'queue_request', 'switch_endpoint'],
      context_overflow: ['compact_history', 'summarize_old_turns', 'start_fresh_session'],
    }

    return defaults[failureCode] ?? ['retry', 'fallback', 'escalate']
  }
}
