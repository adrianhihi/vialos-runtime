<div align="center">

<img src="https://img.shields.io/npm/v/@vial-agent/runtime?color=orange&label=%40vial-agent%2Fruntime&style=flat-square" />
<img src="https://img.shields.io/npm/dm/@vial-agent/runtime?style=flat-square&color=orange" />
<img src="https://img.shields.io/github/license/adrianhihi/vialos-runtime?style=flat-square" />
<img src="https://img.shields.io/github/stars/adrianhihi/vialos-runtime?style=flat-square" />

# VialOS Runtime

**The operating system for AI agents.**

*Your agents fail. They learn nothing. They fail again.*
*VialOS fixes this.*

[Quick Start](#quick-start) · [How it works](#how-it-works) · [Examples](#examples) · [Docs](#api)

</div>

---

## The problem with AI agents today

**The math is brutal:**

```
An agent with 85% accuracy fails 80% of the time on a 10-step task.
85% × 85% × 85% × ... × 85% (×10) = 19.7% success rate.
```

This isn't a bug. It's compound failure — and it's killing agent projects everywhere.

**The numbers, from 2025 research:**

| Source | Finding |
|--------|---------|
| Carnegie Mellon | Best agent (Gemini 2.5 Pro) fails real-world tasks **70% of the time** |
| Carnegie Mellon | GPT-4o fails **91.4%** of office tasks |
| Gartner | **40%** of agentic AI projects will be cancelled by 2027 |
| MIT | **95%** of AI pilot programs stall — zero measurable P&L impact |
| S&P Global | **42%** of companies abandoned most AI initiatives in 2024 |
| Enterprise survey | Only **95 of 1,837** AI teams have agents actually live in production |

**The root cause (MIT calls it "the learning gap"):**

```
Day 1:   Agent fails on nonce error
Day 100: Agent fails on the same nonce error
         Nothing was learned. Every failure is a fresh start.
```

> *"We're deploying goldfish and expecting them to become sharks."*

**VialOS fixes this:**

```
Failure            →   PCEC engine diagnoses it
                   →   Constructs repair strategies
                   →   Picks the best one (Q-learning)
                   →   Executes and records in Gene Map
                   →   Next identical failure: instant fix
                   →   Confidence compounds over time
```

## Quick Start

```bash
npm install @vial-agent/runtime
```

```typescript
import { ClaudeCodeAdapter } from '@vial-agent/runtime'

const adapter = new ClaudeCodeAdapter({
  geneMapPath: './my-agent.db'  // persistent memory lives here
})

const result = await adapter.run(
  { prompt: 'Your agent task here' },
  async (prompt, ctx) => {
    // your existing agent code — unchanged
    const response = await yourAgent.run(prompt)
    return { output: response.text, success: !response.error }
  }
)

console.log(result.vialStrategy)  // what repair strategy was used
console.log(result.vialAttempts)  // how many attempts it took
```

**That's it.** Your agent now self-heals and learns from every failure.

---

## How it works

VialOS wraps your agent with a **PCEC loop** and a **Gene Map**:

```
                    ┌─────────────────────────────────┐
                    │         Your Agent               │
                    └──────────────┬──────────────────┘
                                   │
                    ┌──────────────▼──────────────────┐
                    │         VialOS Runtime           │
                    │                                  │
                    │  P  Perceive  ← diagnose failure │
                    │  C  Construct ← generate fixes   │
                    │  E  Evaluate  ← score strategies │
                    │  C  Commit    ← execute + learn  │
                    │                                  │
                    │  ┌──────────────────────────┐   │
                    │  │  Gene Map (SQLite)        │   │
                    │  │  · Failure patterns       │   │
                    │  │  · Repair strategies      │   │
                    │  │  · Success rates (Q-value)│   │
                    │  └──────────────────────────┘   │
                    └─────────────────────────────────┘
```

### Gene Map: persistent memory that compounds

Every execution adds to the Gene Map. Every failure teaches a repair strategy. Every success increases the Q-value of that strategy.

```
Attempt 1:  nonce_error → tries 3 strategies → succeeds on attempt 2  (confidence: 70%)
Attempt 2:  nonce_error → Gene Map: use increment_nonce               (confidence: 80%)
Attempt 10: nonce_error → instant fix, first attempt                  (confidence: 95%)
```

The longer you run, the smarter it gets. **Unlike LLM context, Gene Map never forgets.**

---

## Examples

### Wrap any Claude Code agent

```typescript
import Anthropic from '@anthropic-ai/sdk'
import { ClaudeCodeAdapter } from '@vial-agent/runtime'

const client = new Anthropic()
const adapter = new ClaudeCodeAdapter({ geneMapPath: './agent.db' })

// your agent — completely unchanged
async function myAgent(prompt: string) {
  const response = await client.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 1000,
    messages: [{ role: 'user', content: prompt }]
  })
  return response.content[0].type === 'text' ? response.content[0].text : ''
}

// wrap with VialOS — one line
const result = await adapter.run(
  { prompt: 'Fix this failing transaction', maxTurns: 10 },
  async (prompt, ctx) => {
    const output = await myAgent(prompt)
    return { output, success: true }
  }
)
```

### Payment agents (Helix integration)

```typescript
import { ClaudeCodeAdapter } from '@vial-agent/runtime'

const adapter = new ClaudeCodeAdapter({
  geneMapPath: './helix-genes.db',
  maxRetries: 3,
})

// Automatically learns: nonce errors → increment_nonce
//                       gas errors  → increase_gas_limit
//                       balance err → check_balance first
const result = await adapter.run(
  { prompt: `Repair this transaction: ${JSON.stringify(failedTx)}` },
  async (prompt, ctx) => {
    const repair = await helixClient.heal({ transaction: failedTx, error })
    return { output: JSON.stringify(repair), success: repair.success }
  }
)
```

### Check what your agent has learned

```typescript
const genes = adapter.getGeneMap().list()

genes.forEach(gene => {
  console.log(`${gene.failureCode}: ${gene.strategy} (${Math.round(gene.qValue * 100)}% success)`)
})

// nonce_error:   increment_nonce    (95% success)
// gas_error:     increase_gas_limit (88% success)
// timeout:       retry_with_backoff (72% success)
```

### Multi-agent meeting room (AMP Protocol)

```typescript
import { AMPBus } from '@vial-agent/runtime'

const bus = new AMPBus()
const session = bus.createSession('Fix production bug', ['code', 'review'], 100_000)

// CodeAgent proposes a fix
await bus.publish(session.id, 'code', 'review', 'proposal',
  'I will fix the nonce error in transaction.ts', { confidence: 0.9 })

// ReviewAgent responds
await bus.publish(session.id, 'review', 'code', 'support',
  'Approved — increment nonce by current chain value', { confidence: 0.85 })

// Get all messages
const messages = bus.getMessages(session.id)
```

---

## What's included

| Module | Description |
|--------|-------------|
| `ClaudeCodeAdapter` | Wrap any agent with PCEC self-healing |
| `GeneMap` | SQLite persistent memory with Q-learning |
| `PCEC` | Perceive → Construct → Evaluate → Commit engine |
| `GeneDream` | Offline knowledge consolidation (4 phases) |
| `AMPBus` | Agent Meeting Protocol — structured multi-agent communication |

---

## Compared to alternatives

|  | LangChain | AutoGen | CrewAI | **VialOS** |
|--|-----------|---------|--------|------------|
| Self-healing | ❌ | ❌ | ❌ | ✅ PCEC loop |
| Persistent memory | ❌ | ❌ | ❌ | ✅ Gene Map |
| Learns from failures | ❌ | ❌ | ❌ | ✅ Q-learning |
| Multi-agent protocol | partial | ✅ | ✅ | ✅ AMP |
| Model agnostic | ✅ | ✅ | ✅ | ✅ |
| One-line integration | ❌ | ❌ | ❌ | ✅ |

The difference: **other frameworks coordinate agents. VialOS makes them durable.**

---

## Architecture

VialOS Runtime is the foundation layer. Verticals run on top:

```
VialOS Runtime  (@vial-agent/runtime)
      │
      ├── Helix       — self-healing payment agents   (npm: @helix-agent/core)
      ├── Your App    — bring your own vertical
      └── ...
```

Inspired by analysis of Claude Code internals (KAIROS, COORDINATOR, DreamTask)
and independently validated by EvoMap's convergence on the same architecture.

---

## API

### `ClaudeCodeAdapter`

```typescript
new ClaudeCodeAdapter(config?: {
  geneMapPath?: string      // default: './vial-claude-code.db'
  maxRetries?: number       // default: 3
  dreamThreshold?: number   // run Gene Dream after N capsules (default: 50)
  verbose?: boolean         // log PCEC steps (default: false)
})

adapter.run(config, executor) → Promise<AdapterResult>
adapter.getGeneMap()         → GeneMap
adapter.dream()              → Promise<void>  // force Gene Dream
adapter.close()              → void
```

### `GeneMap`

```typescript
new GeneMap(dbPath?: string)

geneMap.query(context)                → Gene[]
geneMap.getBestStrategy(failureCode)  → Gene | null
geneMap.recordCapsule(capsule)        → string
geneMap.list()                        → Gene[]
geneMap.shouldDream(threshold)        → boolean
geneMap.close()                       → void
```

### `PCEC`

```typescript
new PCEC({ geneMap, maxRetries? })

pcec.repair(failure, executor) → Promise<PCECResult>
// PCECResult: { success, attempts, finalStrategy, escalated }
```

---

## Installation

```bash
# npm
npm install @vial-agent/runtime

# pnpm
pnpm add @vial-agent/runtime

# yarn
yarn add @vial-agent/runtime
```

Requires: Node.js 18+, better-sqlite3

---

## Philosophy

> "The model is the most interchangeable part.
>  The harness is where years of production experience live."
>  — Inside Claude Code

VialOS is the harness. PCEC + Gene Map is the experience that compounds.

---

## Built with VialOS

- **[Helix](https://github.com/adrianhihi/helix-sdk)** — self-healing payment SDK for AI agents. Listed on [MPPScan](https://www.mppscan.com).

---

## Contributing

PRs welcome. See [CONTRIBUTING.md](CONTRIBUTING.md).

Areas we need help:
- More `Perceive` classifiers for different domains (LLM errors, database errors, API errors)
- More `Construct` strategies
- Adapters for other agent frameworks (LangChain, AutoGen, LlamaIndex)

---

## License

MIT

---

<div align="center">

**[npm](https://www.npmjs.com/package/@vial-agent/runtime)** · **[GitHub](https://github.com/adrianhihi/vialos-runtime)** · **[Helix](https://github.com/adrianhihi/helix-sdk)**

*Star ⭐ if VialOS saved your agent from itself.*

</div>
