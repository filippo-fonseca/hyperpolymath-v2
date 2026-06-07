# Research: Fast LLM Inference for JARVIS — May 2026

## TL;DR (opinionated)

**Do NOT swap inference layer for the primary agent path.** Groq/Cerebras/SambaNova all give 10-20× tokens/sec wins, but multi-tool agentic-loop quality on Llama 3.3 70B / Qwen 3 / Llama 4 Maverick lags Sonnet 4.6 by 10-20 pts on τ-bench. That violates the project's "if JARVIS misroutes, v2 has failed" quality bar.

**Recommended hybrid:**
1. **First, exhaust Anthropic-side latency wins** — 1-hour prompt caching on system+tools (highest leverage). Move volatile content out of cached prefix. Verify cache_read_input_tokens > 0 on turn 2.
2. **Then add Haiku 4.5 as a routed fast-path** for trivially-classified turns. Same SDK, same strict tool use, ~2-3× faster TTFT. Route via cheap regex/heuristic classifier: simple CRUD ("add buy milk", "capture: X", "lesno that") → Haiku; ambiguous/multi-action/time-math → Sonnet 4.6.
3. **Reserve Groq/Cerebras for non-routing sub-tasks**: summarization, transcription post-processing, batch work.

## Per-Provider Recap

### Groq (LPU inference)
- **Best Sonnet substitute**: Llama 3.3 70B, Llama 4 Maverick. None match Sonnet 4.6 on agentic routing.
- **Tool use**: OpenAI-compatible function calling, parallel tool calls, JSON mode. Strict structured outputs: partial — JSON mode reliable, strict-schema-during-generation weaker than Anthropic; expect schema drift on complex unions.
- **Context**: 128K typical. No 1M.
- **Pricing**: ~$0.59/$0.79 per Mtok (Llama 3.3 70B). 10-20× cheaper than Sonnet ($3/$15).
- **Latency**: 250-500+ tokens/sec. TTFT ~200ms. A 3-tool agentic turn taking Sonnet 8s could finish in ~1.5s here.

### Cerebras Inference
- **Best substitute**: Llama 3.3 70B, Llama 4 Scout/Maverick, DeepSeek-R1-distill.
- **Tool use**: OpenAI-compatible, parallel tool calls. Structured outputs less battle-tested than Anthropic.
- **Context**: 128K typical; some 32K. No 1M.
- **Pricing**: ~$0.85/$1.20 per Mtok for 70B-class.
- **Latency**: Fastest in industry — 2000+ tokens/sec on 70B, 450+ on 405B. TTFT sub-200ms.

### SambaNova Cloud
- Llama 3.3 70B, Llama 4 Maverick, DeepSeek-V3. Function calling OK, structured output weakest of three. ~$0.60-1.00/Mtok. 400-600 tok/sec.

### Anthropic Claude Haiku 4.5 (the safe lever)
- **Latency vs Sonnet 4.6**: ~2-3× faster TTFT, ~2× faster streaming.
- **Tool use**: full parity — multi-call, parallel, strict mode, agentic loops identical.
- **Quality drop vs Sonnet 4.6**: noticeable on multi-step reasoning and ambiguous routing ("remind me about the thing with Sara" — Sonnet often nails the inference, Haiku punts). For unambiguous CRUD, parity.
- **Pricing**: ~$1/$5 per Mtok (3× cheaper than Sonnet).
- **Context**: 200K standard.

### Prompt Caching (Anthropic, May 2026) — biggest single lever
- Two TTL tiers: 5-min (default, free to write) and 1-hour (write 2× input, read 0.1× input). 1h tier shipped late 2025.
- Latency reduction on warm cache: 50-85% TTFT improvement. For 5-15K token system prompt, ~1.5-3s shaved.
- Cache key is exact token prefix — keep system prompt + tool defs byte-identical and FIRST.
- **Gotcha**: any volatile content (Date.now(), current time) in middle of prefix blows the cache.

## Honest Tradeoff on Inference Swap

What's been benchmarked: BFCL v3, τ-bench, SWE-bench. Llama 3.3 70B and Qwen 2.5/3 72B score competitively on single-turn function calling (top 10 on BFCL) but drop 10-20 points on τ-bench multi-turn (airline/retail agentic scenarios) vs Sonnet 4/4.5/4.6. DeepSeek-V3 closes more. Llama 4 Maverick narrows further but still behind on "infer the right shape of N tool calls from one fuzzy sentence" — which IS JARVIS's core job.

The misroute rate on a Llama-powered router will be measurably higher than Sonnet 4.6. With "misroute = failed" as the stated bar, full swap is a downgrade.

## Recommendation Sequence (do in this order)

1. **Enable 1-hour prompt caching on system + tools.** Single highest-leverage change. `cache_control: {type: "ephemeral", ttl: "1h"}` on last static block.
2. **Verify first-token streaming, not full-response wait.**
3. **Verify tool defs aren't being rebuilt per request.** Sort tools deterministically.
4. **Move volatile content (current time, recent context) to separate message block AFTER cached prefix.**
5. **Add Haiku 4.5 fast-path routing.** Cheap classifier on input length + trigger words. ~60-70% of turns qualify.
6. **DO NOT swap primary path to Groq/Cerebras.**
7. **Long-term experiment (not now)**: build 200-turn eval set with ground-truth tool calls. Run Llama 4 Maverick on Cerebras through it. If misroute rate within 2% of Sonnet, *then* reconsider.

## Sources

- Groq pricing/models: https://groq.com/pricing/, https://console.groq.com/docs/models
- Cerebras: https://inference-docs.cerebras.ai/, https://cerebras.ai/inference
- SambaNova: https://cloud.sambanova.ai/
- Anthropic prompt caching (1h TTL beta Aug 2025, GA late 2025): https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching
- BFCL leaderboard: https://gorilla.cs.berkeley.edu/leaderboard.html
- τ-bench: https://github.com/sierra-research/tau-bench

**Confidence**: Tokens/sec figures and per-Mtok prices drift quarterly — order-of-magnitude correct. The recommendation (cache + Haiku routing, NOT Groq/Cerebras for primary path) holds regardless of exact numbers.
