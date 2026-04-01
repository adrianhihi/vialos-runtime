# VialOS Runtime

> Self-healing agent runtime. What Stripe is to payments, VialOS is to agent infrastructure.

## Core modules

- **PCEC Engine** — Perceive → Construct → Evaluate → Commit self-repair loop
- **Gene Map** — SQLite persistent memory, agents get smarter over time
- **Gene Dream** — 4-phase offline knowledge consolidation
- **AMP Protocol** — Structured agent-to-agent communication (AGI meeting room)

## Quick start

```bash
npm install @vial/runtime
```

```typescript
import { GeneMap, PCEC } from '@vial/runtime'

const geneMap = new GeneMap('./gene.db')
const pcec = new PCEC({ geneMap, maxRetries: 3 })

const result = await pcec.repair(
  { errorType: 'nonce_error', errorMessage: 'nonce too low', sessionId: 'abc', turnCount: 1 },
  async (strategy, params) => {
    // your repair logic here
    return { success: true, output: 'fixed' }
  }
)
```

## Status

Phase 1 — Core engine complete (Gene Map + PCEC + AMP Protocol)
Phase 2 — VialAgentLoop (replacing Claude Code dependency)
Phase 3 — Model-agnostic (OpenAI, Gemini, Ollama)

## Built on

Analysis of Claude Code v2.1.88 internals + Vial PCEC research.
[Helix](https://github.com/adrianhihi/helix-sdk) is the first vertical built on VialOS Runtime.
