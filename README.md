# Intent AI

### *A high-performance, multi-bank financial ledger with a secure, zero-knowledge semantic query engine and exploratory behavioral tracking.*

Intent AI is an AI-native personal finance utility designed to solve the high-friction, anxiety-inducing tracking limitations of the modern digital banking landscape, specifically tailored for the hyper-fragmented Indian UPI ecosystem. 

Traditional fintech trackers fail because they treat personal peer-to-peer (P2P) transfers uniformly, creating a chaotic wall of "Uncategorized P2P Noise" where a ₹20 street tea (*chai-tapri*) transaction looks identical to a ₹40,000 security deposit. Intent AI handles this by decoupling data ingestion, enforcing high-performance local data processing, and providing clear **momentum awareness** rather than strict budget penalties.

---

## 🧭 The Core Problem & Product Philosophy

1. **The UPI Noise Vector:** In India, everyday transactions bypass traditional merchant codes. Everything hits personal VPA handles. Intent AI solves this at the entry gate using a multi-tiered pipeline that filters, normalizes, and dynamically groups transactions into logical behavioral buckets.
2. **The Platform Lock:** Mobile operating systems (particularly iOS) block direct reading of financial SMS strings. Intent AI sidesteps this restriction entirely by introducing three distinct local ingestion channels, including an automated local email parser.
3. **Calm Analytics Over Restriction:** Instead of flashing stressful red warnings when a user breaks an arbitrary budget category, the application uses a fluid, color-interpolating progress gauge tracking overall month-to-date spending velocity.

---

## 🛠️ System Architecture & Data Flow

Intent AI uses a decoupled full-stack TypeScript architecture built for absolute mathematical accuracy, security, and low-latency processing execution.
[ Inbound Pipelines ] \
├── Path A: Account Aggregator (AA) Mock Sync \
├── Path B: Multi-Bank CSV Parse (HDFC / ICICI Parsing Filters) \
└── Path C: Localized IMAP Email Extraction Loop \
│ \
▼ \
┌────────────────────────────────────────────────────────┐ \
│             Core Ingestion & Triage Engine             │ \
├────────────────────────────────────────────────────────┤ \
│ Tier 1: Deterministic Regular Expressions              │ \
│ Tier 2: Indian P2P Structural Heuristics               │ \
│ Tier 3: Context-Driven Batch Velocity Clustering       │ \
└─────────────────────────┬──────────────────────────────┘ \
│ \
▼ \
┌─────────────────────────┐ \
│  PostgreSQL Database    │ \
└────────────┬────────────┘ \
│ \
┌─────────────┴─────────────┐ \
▼                           ▼ \
┌─────────────────────┐     ┌─────────────────────┐ \
│  Habit Audit Card   │     │ Conversational LLM  │ \
│  [Experimental]     │     │ Search Proxy Header │ \
└─────────────────────┘     └─────────────────────┘ \
\
--- 

## ✨ Figma link
https://www.figma.com/make/bfejw47RjHP24txsEkRk7W/User-request?t=WD9G9TZv14gfhssA-20&fullscreen=1

## ✨ Features Breakdown

### 1. Ingestion & Triage Pipeline (Core Engine)
* **Multi-Source Data Paths:** Supports sandbox Account Aggregator sync payloads, text-sanitizing multi-bank CSV statement trackers, and a localized IMAP email alert processing script to sweep disparate bank structures simultaneously into a single ledger.
* **Batch Velocity Clustering:** Employs a rolling, deterministic 90-minute window pass across candidates under ₹100. It condenses high-frequency street payments into an elegant single inbox stack component, generating an idempotent, unalterable `cluster_id` via SHA-256 hashes of transaction components.
* **Stateless Workspace Reset:** Includes a secure endpoint (`POST /api/user/reset`) designed to completely truncate local transaction records and clear user onboarding flags, allowing developers to alternate testing profiles seamlessly.

### 2. Conversational Semantic Search Bar
A natural language command line allowing users to ask arbitrary financial questions (*"How much did I spend on Swiggy in the last 3 months?"*) with absolute mathematical accuracy.
* **Context Optimization:** Instead of running highly variable and high-latency text-parsing regex maps or allowing the LLM to calculate math parameters (which causes hallucinations), the backend compiles a token-compressed 6-month transaction JSON vector directly into the prompt context.
* **Developer Trace Layer:** Features an inline disclosure drawer beneath search results displaying the exact query pipeline script executing in the backend, proving absolute system transparency during technical reviews.

### 3. [Experimental] Behavioral Habit Audit Engine
As an exploratory, read-only analytics feature, the dashboard mounts a specialized insight card right beneath the primary progress meter. Rather than claiming absolute diagnostic profiling, this card runs parallel SQL queries to call out clear anomalies and recurring loops for user self-reflection:

| Insight Vector | Technical Tracking Logic | Target Narrative Output |
| :--- | :--- | :--- |
| **The Velocity Leak** | Scans rolling 7-day windows for clustered transactions where `cluster_id IS NOT NULL` and amount is `< ₹100` (Minimum threshold >= 8 hits). | *"You logged {count} micro-payments under ₹100 this week. This tracking fatigue quietly drained **₹{total_amount}** from your safe limit."* |
| **The Salary-Day Decay** | Identifies recurring incoming credit anchors and tracks if the average discretionary debit ticket size jumps by a multiplier >= **1.25x** within 72 hours. | *"Payday adrenaline check: Your average transaction size spikes by **{multiplier}x** within 3 days of receiving your salary."* |
| **VPA Affinity Scoring** | Aggregates unique unmapped vendor VPA strings to find consistent peer relationships appearing >= 3 times a month without text markers. | *"You have a high-frequency loop with an informal local vendor ({vpa}) this month. You've tapped their QR code {count} times."* |
| **Cyclical Volume Pulse** | Treats the ledger as a time-series signal, checking time-deltas between spending volume peaks exceeding the user's daily mean by 1.5 standard deviations (+1.5σ). | *"Hidden Cycle Detected: Every {interval} days, your discretionary spending volume pulses by an extra **₹{amount}**."* |

---

## 🔒 Security & Privacy Engineering

### Stateless Zero-Knowledge AI Header Proxy
Intent AI does not persist user API keys on its server storage infrastructure. Instead, it operates on a secure, ephemeral routing pipeline:

1. **Session Encapsulation:** The frontend captures the user's private OpenAI API credential and stores it entirely on the client side inside the browser session (`localStorage`).
2. **Stateless Request Routing:** During semantic search execution, the client injects the token cleanly through a custom request header (`x-user-openai-key`).
3. **Dynamic Client Instantiation:** The Express backend pulls the header value at runtime to spin up an isolated, short-lived instance of the OpenAI client SDK wrapper for the lifecycle of that specific operational thread, processes the prompt synthesis, and immediately discards the token.

---

## 🚀 Tech Stack

* **Frontend:** React, Tailwind CSS (Mobile-first, touch-responsive fluid layout models).
* **Backend:** Node.js, Express, TypeScript (Strict compile-time type boundaries across ingestion models).
* **Database:** PostgreSQL (Optimized partial indexes and transactional check constraints).
* **AI Tooling:** OpenAI Node SDK client wrapper bindings.

---

