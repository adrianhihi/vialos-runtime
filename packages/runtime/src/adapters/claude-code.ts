import { randomUUID } from 'crypto'
import { GeneMap } from '../gene/map.js'
import { PCEC } from '../pcec/index.js'
import { GeneDream } from '../gene/dream.js'

export interface ClaudeCodeAdapterConfig {
  geneMapPath?: string
  maxRetries?: number
  dreamThreshold?: number
  verbose?: boolean
}

export interface AdapterRunConfig {
  prompt: string
  sessionId?: string
  cwd?: string
  tools?: string[]
  maxTurns?: number
  systemPrompt?: string
}

export interface AdapterResult {
  output: string
  success: boolean
  vialStrategy: string
  vialAttempts: number
  vialEscalated: boolean
  sessionId: string
}

export type AgentExecutor = (
  prompt: string,
  context: Record<string, unknown>
) => Promise<{ output: string; success: boolean; error?: string }>

/**
 * ClaudeCodeAdapter — wraps any Claude Code agent executor with
 * VialOS PCEC self-healing + Gene Map persistent memory.
 *
 * Usage:
 *   const adapter = new ClaudeCodeAdapter()
 *   const result = await adapter.run(
 *     { prompt: 'Fix this payment transaction' },
 *     async (prompt, ctx) => {
 *       // your existing Claude Code logic here
 *       const result = await ask({ prompt, ...ctx })
 *       return { output: result.text, success: !result.isError }
 *     }
 *   )
 */
export class ClaudeCodeAdapter {
  private geneMap: GeneMap
  private pcec: PCEC
  private config: Required<ClaudeCodeAdapterConfig>

  constructor(config: ClaudeCodeAdapterConfig = {}) {
    this.config = {
      geneMapPath: config.geneMapPath ?? './vial-claude-code.db',
      maxRetries: config.maxRetries ?? 3,
      dreamThreshold: config.dreamThreshold ?? 50,
      verbose: config.verbose ?? false,
    }

    this.geneMap = new GeneMap(this.config.geneMapPath)
    this.pcec = new PCEC({
      geneMap: this.geneMap,
      maxRetries: this.config.maxRetries,
    })
  }

  async run(
    config: AdapterRunConfig,
    executor: AgentExecutor
  ): Promise<AdapterResult> {
    const sessionId = config.sessionId ?? randomUUID()

    // Perceive: inject Gene Map context into prompt
    const relevantGenes = this.geneMap.query({ limit: 5 })
    const enrichedContext: Record<string, unknown> = {
      sessionId,
      cwd: config.cwd ?? process.cwd(),
      tools: config.tools ?? [],
      maxTurns: config.maxTurns ?? 10,
      systemPrompt: config.systemPrompt,
      geneContext: relevantGenes.length > 0
        ? `Known repair strategies:\n${relevantGenes.map(g =>
            `- ${g.failureCode}: ${g.strategy} (${Math.round(g.qValue * 100)}% success)`
          ).join('\n')}`
        : '',
    }

    let lastError: string | undefined

    // PCEC repair loop
    const pcecResult = await this.pcec.repair(
      {
        errorType: lastError ?? 'initial_run',
        errorMessage: lastError ?? config.prompt,
        sessionId,
        turnCount: 0,
      },
      async (strategy, _params) => {
        if (this.config.verbose) {
          console.log(`[VialOS] Running with strategy: ${strategy}`)
        }

        const result = await executor(config.prompt, {
          ...enrichedContext,
          vialStrategy: strategy,
        })

        lastError = result.error

        return {
          success: result.success,
          output: result.output,
        }
      }
    )

    // Trigger Gene Dream asynchronously if threshold reached
    if (this.geneMap.shouldDream(this.config.dreamThreshold)) {
      const dream = new GeneDream(this.geneMap)
      dream.run()
        .then(results => {
          if (this.config.verbose) {
            console.log('[VialOS Dream]', results.map(r => r.summary).join(' | '))
          }
        })
        .catch(() => {})
    }

    return {
      output: lastError ?? config.prompt,
      success: pcecResult.success,
      vialStrategy: pcecResult.finalStrategy,
      vialAttempts: pcecResult.attempts,
      vialEscalated: pcecResult.escalated,
      sessionId,
    }
  }

  getGeneMap(): GeneMap {
    return this.geneMap
  }

  async dream(): Promise<void> {
    const dream = new GeneDream(this.geneMap)
    await dream.run()
  }

  close(): void {
    this.geneMap.close()
  }
}
