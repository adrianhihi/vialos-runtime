import type { GeneMap, GeneCapsule } from './map.js'
import { randomUUID } from 'crypto'

export interface DreamResult {
  phase: string
  genesCreated: number
  genesUpdated: number
  capsulesProcessed: number
  summary: string
}

export class GeneDream {
  constructor(private geneMap: GeneMap) {}

  async run(): Promise<DreamResult[]> {
    console.log('[Dream] Starting Gene Dream...')
    const capsules = this.geneMap.getRecentCapsules(200)

    if (capsules.length === 0) {
      return [{ phase: 'skip', genesCreated: 0, genesUpdated: 0, capsulesProcessed: 0, summary: 'No capsules to process' }]
    }

    const results: DreamResult[] = []

    // Phase 1: Orient — understand what happened
    results.push(await this.orient(capsules))

    // Phase 2: Gather — group by failure type
    results.push(await this.gather(capsules))

    // Phase 3: Consolidate — extract patterns
    results.push(await this.consolidate(capsules))

    // Phase 4: Prune — remove low-value genes
    results.push(await this.prune())

    console.log('[Dream] Complete')
    return results
  }

  private async orient(capsules: GeneCapsule[]): Promise<DreamResult> {
    const successRate = capsules.filter(c => c.success).length / capsules.length
    const byTool = this.groupBy(capsules, c => c.toolName)
    const summary = [
      `Processed ${capsules.length} capsules`,
      `Success rate: ${Math.round(successRate * 100)}%`,
      `Tools used: ${Object.keys(byTool).join(', ')}`,
    ].join('\n')

    return { phase: 'orient', genesCreated: 0, genesUpdated: 0, capsulesProcessed: capsules.length, summary }
  }

  private async gather(capsules: GeneCapsule[]): Promise<DreamResult> {
    const failures = capsules.filter(c => !c.success && c.errorType)
    const byError = this.groupBy(failures, c => c.errorType!)

    const summary = Object.entries(byError)
      .map(([error, caps]) => `${error}: ${caps.length} failures`)
      .join('\n')

    return { phase: 'gather', genesCreated: 0, genesUpdated: 0, capsulesProcessed: failures.length, summary }
  }

  private async consolidate(capsules: GeneCapsule[]): Promise<DreamResult> {
    // Find repair patterns: error → strategy → success
    const repairs = capsules.filter(c => c.repairStrategy && c.success)
    const byStrategy = this.groupBy(repairs, c => `${c.errorType}::${c.repairStrategy}`)

    let created = 0
    for (const [key, caps] of Object.entries(byStrategy)) {
      if (caps.length >= 2) {
        const [errorType, strategy] = key.split('::')
        // Re-record to strengthen gene q-values
        for (const cap of caps) {
          this.geneMap.recordCapsule({
            sessionId: `dream_${randomUUID()}`,
            toolName: cap.toolName,
            input: cap.input,
            output: cap.output,
            success: true,
            errorType,
            repairStrategy: strategy,
            durationMs: cap.durationMs,
          })
        }
        created++
      }
    }

    return {
      phase: 'consolidate',
      genesCreated: created,
      genesUpdated: 0,
      capsulesProcessed: repairs.length,
      summary: `Consolidated ${created} repair patterns from ${repairs.length} successful repairs`,
    }
  }

  private async prune(): Promise<DreamResult> {
    const genes = this.geneMap.list()
    const stale = genes.filter(g => g.consecutiveFailures > 5 && g.qValue < 0.2)

    return {
      phase: 'prune',
      genesCreated: 0,
      genesUpdated: stale.length,
      capsulesProcessed: 0,
      summary: `Identified ${stale.length} stale genes for review (q_value < 0.2, consecutive failures > 5)`,
    }
  }

  private groupBy<T>(arr: T[], key: (item: T) => string): Record<string, T[]> {
    return arr.reduce((acc, item) => {
      const k = key(item)
      if (!acc[k]) acc[k] = []
      acc[k].push(item)
      return acc
    }, {} as Record<string, T[]>)
  }
}
