import Database from 'better-sqlite3'
import { randomUUID } from 'crypto'
import { join } from 'path'

export interface Gene {
  id: string
  failureCode: string
  category: string
  strategy: string
  successCount: number
  failureCount: number
  consecutiveFailures: number
  qValue: number
  context: string
  createdAt: number
  updatedAt: number
}

export interface GeneCapsule {
  id: string
  sessionId: string
  toolName: string
  input: string
  output: string
  success: boolean
  errorType?: string
  repairStrategy?: string
  durationMs: number
  tokenCost?: number
  createdAt: number
}

export class GeneMap {
  private db: Database.Database

  constructor(dbPath: string = './vial-gene.db') {
    this.db = new Database(dbPath)
    this.init()
  }

  private rowToGene(row: Record<string, unknown>): Gene {
    return {
      id: row.id as string,
      failureCode: row.failure_code as string,
      category: row.category as string,
      strategy: row.strategy as string,
      successCount: row.success_count as number,
      failureCount: row.failure_count as number,
      consecutiveFailures: row.consecutive_failures as number,
      qValue: row.q_value as number,
      context: row.context as string,
      createdAt: row.created_at as number,
      updatedAt: row.updated_at as number,
    }
  }

  private rowToCapsule(row: Record<string, unknown>): GeneCapsule {
    return {
      id: row.id as string,
      sessionId: row.session_id as string,
      toolName: row.tool_name as string,
      input: row.input as string,
      output: row.output as string,
      success: row.success === 1,
      errorType: row.error_type as string | undefined,
      repairStrategy: row.repair_strategy as string | undefined,
      durationMs: row.duration_ms as number,
      tokenCost: row.token_cost as number | undefined,
      createdAt: row.created_at as number,
    }
  }

  private init(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS genes (
        id TEXT PRIMARY KEY,
        failure_code TEXT NOT NULL,
        category TEXT NOT NULL,
        strategy TEXT NOT NULL,
        success_count INTEGER DEFAULT 0,
        failure_count INTEGER DEFAULT 0,
        consecutive_failures INTEGER DEFAULT 0,
        q_value REAL DEFAULT 0.5,
        context TEXT DEFAULT '{}',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS capsules (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        tool_name TEXT NOT NULL,
        input TEXT NOT NULL,
        output TEXT NOT NULL,
        success INTEGER NOT NULL,
        error_type TEXT,
        repair_strategy TEXT,
        duration_ms INTEGER NOT NULL,
        token_cost INTEGER,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS dream_log (
        id TEXT PRIMARY KEY,
        phase TEXT NOT NULL,
        summary TEXT NOT NULL,
        genes_affected INTEGER DEFAULT 0,
        capsules_processed INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_genes_failure_code ON genes(failure_code);
      CREATE INDEX IF NOT EXISTS idx_capsules_session ON capsules(session_id);
      CREATE INDEX IF NOT EXISTS idx_capsules_tool ON capsules(tool_name);
    `)
  }

  // Query relevant genes for a given context
  query(context: {
    toolName?: string
    errorType?: string
    category?: string
    limit?: number
  }): Gene[] {
    let sql = 'SELECT * FROM genes WHERE q_value > 0.3'
    const params: unknown[] = []

    if (context.category) {
      sql += ' AND category = ?'
      params.push(context.category)
    }
    if (context.errorType) {
      sql += ' AND failure_code LIKE ?'
      params.push(`%${context.errorType}%`)
    }

    sql += ' ORDER BY q_value DESC, success_count DESC LIMIT ?'
    params.push(context.limit ?? 10)

    return (this.db.prepare(sql).all(...params) as Record<string, unknown>[]).map(r => this.rowToGene(r))
  }

  // Record a gene capsule (tool execution result)
  recordCapsule(capsule: Omit<GeneCapsule, 'id' | 'createdAt'>): string {
    const id = randomUUID()
    const now = Date.now()

    this.db.prepare(`
      INSERT INTO capsules (
        id, session_id, tool_name, input, output, success,
        error_type, repair_strategy, duration_ms, token_cost, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      capsule.sessionId,
      capsule.toolName,
      capsule.input,
      capsule.output,
      capsule.success ? 1 : 0,
      capsule.errorType ?? null,
      capsule.repairStrategy ?? null,
      capsule.durationMs,
      capsule.tokenCost ?? null,
      now
    )

    // Update gene q-value based on outcome
    if (capsule.errorType) {
      this.updateGene(capsule.errorType, capsule.repairStrategy ?? 'unknown', capsule.success)
    }

    return id
  }

  private updateGene(failureCode: string, strategy: string, success: boolean): void {
    const now = Date.now()
    const row = this.db.prepare(
      'SELECT * FROM genes WHERE failure_code = ? AND strategy = ?'
    ).get(failureCode, strategy) as Record<string, unknown> | undefined
    const existing = row ? this.rowToGene(row) : undefined

    if (existing) {
      const newSuccess = existing.successCount + (success ? 1 : 0)
      const newFailure = existing.failureCount + (success ? 0 : 1)
      const total = newSuccess + newFailure
      // Q-learning update
      const newQ = total > 0 ? newSuccess / total : 0.5

      this.db.prepare(`
        UPDATE genes SET
          success_count = ?,
          failure_count = ?,
          consecutive_failures = ?,
          q_value = ?,
          updated_at = ?
        WHERE id = ?
      `).run(
        newSuccess,
        newFailure,
        success ? 0 : existing.consecutiveFailures + 1,
        newQ,
        now,
        existing.id
      )
    } else {
      this.db.prepare(`
        INSERT INTO genes (
          id, failure_code, category, strategy,
          success_count, failure_count, consecutive_failures,
          q_value, context, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        randomUUID(),
        failureCode,
        'auto',
        strategy,
        success ? 1 : 0,
        success ? 0 : 1,
        success ? 0 : 1,
        success ? 0.8 : 0.2,
        '{}',
        now,
        now
      )
    }
  }

  // Get best repair strategy for a failure.
  //
  // Returns null if no gene meets the minimum quality threshold (q_value > 0.3),
  // matching the threshold already enforced in query(). Previously this method
  // returned any gene with success_count > 0 regardless of q_value, which allowed
  // a single lucky LLM-generated strategy with q_value=0.2 to be preferred over
  // falling back to adapter defaults (Q-value poisoning).
  //
  // The 0.3 threshold is chosen to match the existing query() method and align
  // with the gene failure default (0.2): any gene scored as "failure-first" is
  // excluded, any gene scored as "mixed or better" is kept.
  getBestStrategy(failureCode: string): Gene | null {
    const row = this.db.prepare(`
      SELECT * FROM genes
      WHERE failure_code LIKE ?
      AND success_count > 0
      AND q_value > 0.3
      ORDER BY q_value DESC
      LIMIT 1
    `).get(`%${failureCode}%`) as Record<string, unknown> | undefined
    return row ? this.rowToGene(row) : null
  }

  // List all genes
  list(): Gene[] {
    return (this.db.prepare('SELECT * FROM genes ORDER BY q_value DESC').all() as Record<string, unknown>[]).map(r => this.rowToGene(r))
  }

  // Get recent capsules for Dream processing
  getRecentCapsules(limit: number = 100): GeneCapsule[] {
    return (this.db.prepare(`
      SELECT * FROM capsules
      ORDER BY created_at DESC
      LIMIT ?
    `).all(limit) as Record<string, unknown>[]).map(r => this.rowToCapsule(r))
  }

  // Check if Dream should run (enough new capsules)
  shouldDream(threshold: number = 50): boolean {
    const lastDream = this.db.prepare(
      'SELECT created_at FROM dream_log ORDER BY created_at DESC LIMIT 1'
    ).get() as { created_at: number } | undefined

    const since = lastDream?.created_at ?? 0
    const newCapsules = this.db.prepare(
      'SELECT COUNT(*) as count FROM capsules WHERE created_at > ?'
    ).get(since) as { count: number }

    return newCapsules.count >= threshold
  }

  close(): void {
    this.db.close()
  }
}
