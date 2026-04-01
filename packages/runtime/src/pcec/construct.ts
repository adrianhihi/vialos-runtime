import type { PerceiveResult } from './perceive.js'
import type { GeneMap } from '../gene/map.js'

export interface RepairStrategy {
  id: string
  name: string
  description: string
  confidence: number
  params: Record<string, unknown>
}

export class Construct {
  constructor(private geneMap: GeneMap) {}

  async generate(perception: PerceiveResult): Promise<RepairStrategy[]> {
    const strategies: RepairStrategy[] = []

    // Strategy 1: Use best historical gene
    const bestGene = this.geneMap.getBestStrategy(perception.failureCode)
    if (bestGene && bestGene.qValue > 0.6) {
      strategies.push({
        id: `gene_${bestGene.id}`,
        name: bestGene.strategy,
        description: `Proven strategy with ${Math.round(bestGene.qValue * 100)}% success rate`,
        confidence: bestGene.qValue,
        params: { source: 'gene_map', geneId: bestGene.id },
      })
    }

    // Strategy 2: Domain-specific strategies from perception
    for (const strategyName of perception.suggestedStrategies.slice(0, 3)) {
      const existing = strategies.find(s => s.name === strategyName)
      if (!existing) {
        strategies.push({
          id: `suggested_${strategyName}`,
          name: strategyName,
          description: this.describeStrategy(strategyName, perception),
          confidence: this.estimateConfidence(strategyName, perception),
          params: this.buildParams(strategyName, perception),
        })
      }
    }

    // Sort by confidence
    return strategies.sort((a, b) => b.confidence - a.confidence)
  }

  private describeStrategy(name: string, perception: PerceiveResult): string {
    const descriptions: Record<string, string> = {
      increment_nonce: 'Fetch current nonce from chain and increment by 1',
      fetch_current_nonce: 'Get accurate nonce from RPC node',
      increase_gas_limit: 'Multiply gas estimate by 1.5x',
      estimate_gas_dynamic: 'Re-estimate gas using eth_estimateGas',
      retry_with_backoff: 'Wait exponentially before retrying',
      compact_history: 'Compress conversation history to free context',
      escalate: 'Escalate to human for intervention',
    }
    return descriptions[name] ?? `Apply ${name} repair strategy`
  }

  private estimateConfidence(name: string, perception: PerceiveResult): number {
    // Base confidence from severity
    const severityBase: Record<string, number> = {
      low: 0.7, medium: 0.6, high: 0.5, critical: 0.4,
    }
    let confidence = severityBase[perception.severity] ?? 0.5

    // Boost if we have historical data
    if (perception.relevantGenes.length > 0) confidence += 0.1

    // Specific strategy confidence adjustments
    if (name === 'escalate') confidence = 0.3 // Last resort
    if (name === 'retry_with_backoff') confidence = Math.min(confidence, 0.6)

    return Math.min(confidence, 0.95)
  }

  private buildParams(name: string, perception: PerceiveResult): Record<string, unknown> {
    const params: Record<string, unknown> = {
      failureCode: perception.failureCode,
      severity: perception.severity,
    }

    if (name === 'retry_with_backoff') {
      params.maxRetries = 3
      params.baseDelayMs = 1000
    }
    if (name === 'increase_gas_limit') {
      params.multiplier = 1.5
    }

    return params
  }
}
