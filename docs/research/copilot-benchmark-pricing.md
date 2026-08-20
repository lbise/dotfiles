# Repricing benchmark runs for GitHub Copilot

## Conclusion

This is straightforward **when a benchmark exposes token usage**. GitHub Copilot's current usage-based billing prices input, cached-input, cache-write, and output tokens per model, then converts the result to GitHub AI Credits (`1 AI credit = $0.01 USD`). A converter can therefore reprice the benchmark's token trace using GitHub's rate card.

It is not generally possible to convert a leaderboard's already-aggregated API dollar figure accurately. Different token classes have different prices, so the original dollar total does not preserve enough information. Benchmarks need an adapter that provides token counts, model identity, and—where relevant—the context tier used.

Annual Copilot Pro and Pro+ subscriptions that remain on GitHub's legacy request-based billing are a separate calculation using model multipliers; they must not be mixed with the token-based calculation.

## Primary sources

- [GitHub: Models and pricing for GitHub Copilot](https://docs.github.com/en/copilot/reference/copilot-billing/models-and-pricing) defines current per-million-token rates, AI Credits, long-context thresholds, cache-write charges, code-completion treatment, and the legacy annual-plan exception.
- [GitHub Copilot plans](https://github.com/features/copilot/plans) gives subscription prices and included allowances. These should be stored as dated rate-card snapshots rather than hard-coded permanently.
- [DeepSWE benchmark](https://deepswe.datacurve.ai/) is the motivating benchmark. Its displayed API cost should be treated as provenance, not as sufficient conversion input; use downloadable traces/artifacts where they expose token classes.
- [DeepSWE source](https://github.com/datacurve-ai/deep-swe) should be pinned to an exact revision when implementing an importer.

## DeepSWE v1.1 data access

The linked heatmap is an HTML UI, but its first-party JavaScript client fetches a public static JSON artifact:

```sh
curl -L 'https://deepswe.datacurve.ai/artifacts/v1.1/trials.json' \
  -o deepswe-v1.1-trials.json
```

No authentication or pagination is currently required. At inspection time the response was about 44.7 MB with 27,558 trial rows. Its shape is `{scope, n_trials, rows}`, and each row includes `trial_name`, `task_name`, `model`, `provider`, `passed`, `cost_usd`, `n_input_tokens`, `n_cache_tokens`, `n_output_tokens`, and `peak_context_tokens`, among other evaluation fields. The heatmap computes its averages from these rows in the browser; the `hm_stat` query parameter only selects the displayed statistic.

This is enough for a useful importer and potentially exact default-tier repricing. A sampled GPT-5.4 row reproduced its reported cost exactly when treating `n_cache_tokens` as a subset of `n_input_tokens` and charging `n_input_tokens - n_cache_tokens` at the regular input rate. That is strong evidence for the field semantics, but the importer should validate them across providers. It is not enough for lossless repricing in every case:

- There is no separate cache-write token field. GitHub charges cache writes for Anthropic and certain OpenAI models.
- `peak_context_tokens` gives the maximum context for a trial, not token counts per interaction. If it exceeds GitHub's long-context threshold, the aggregate row cannot determine how many tokens receive each tier's rate.
- Model aliases and versions still need an explicit mapping to GitHub's rate-card names.
- Six observed rows lacked token metrics, so missing values must remain explicit.

The importer should classify each result as `exact`, `estimated`, or `unsupported`. Runs whose peak context stays below the relevant threshold and whose Copilot rate has no cache-write component can generally be exact after the input/cache semantic is verified; the others should report assumptions or a range.

## Required normalized input

```yaml
benchmark: DeepSWE
benchmark_version: string
run_id: string
task_id: string
model: string
input_tokens: integer
cached_input_tokens: integer | null
cache_write_tokens: integer | null
output_tokens: integer
max_input_tokens_per_interaction: integer | null
reported_api_cost_usd: number | null
```

Preserve per-interaction records if a model has a long-context price threshold. Keep `null` distinct from zero. Also retain benchmark/harness revisions, retries, model routing, and the definition of a successful task.

## Calculation

For Copilot rates per one million tokens `p_in`, `p_cached`, `p_write`, and `p_out`:

```text
copilot_usage_usd = (
    input_tokens       * p_in
  + cached_input_tokens * p_cached
  + cache_write_tokens  * p_write
  + output_tokens       * p_out
) / 1_000_000

ai_credits = copilot_usage_usd / 0.01
cost_per_task = total_copilot_usage_usd / task_count
cost_per_success = total_copilot_usage_usd / successful_task_count
```

The cache-write term is model-dependent. The selected default/long-context row must be chosen per interaction from GitHub's documented threshold. Missing token classes should produce a warning or range, not silently be treated as zero.

To model a plan rather than raw usage, apply its included AI Credit allowance and subscription fee separately. This produces both:

1. **Marginal inference cost** under Copilot's rate card.
2. **Effective plan cost**, with an explicit amortization assumption (for example, one benchmark run in one billing month).

A monthly subscription cannot be assigned uniquely to a benchmark without such an assumption.

## Suggested tool design

1. **Benchmark adapters** convert DeepSWE, SWE-bench harness output, or user CSV/JSON into the normalized schema.
2. A **versioned GitHub rate card** stores model aliases, token rates, cache rules, context thresholds, effective date, and source URL.
3. A **pricing engine** computes raw usage, AI Credits, plan allowance usage, per-task cost, and per-success cost.
4. A **reporter** compares models on benchmark score, cost, and score-per-dollar while showing missing-data warnings.

The core engine can be benchmark-agnostic; “any benchmark” support still requires either a standard input schema or a small adapter for each result format.

## Effort estimate

- One benchmark plus manually maintained GitHub rates: roughly **1–2 focused days** for a CLI and CSV/JSON report.
- A reusable tool with adapter plugins, rate-card snapshots, validation, tests, and charts: roughly **several days to one week**.
- Automatic ingestion from arbitrary benchmark websites is the hard and brittle part; prefer published artifacts or explicit import adapters.

## Residual risks

Model aliases and rates change, Copilot-hosted model versions may not exactly match benchmark endpoints, hidden retries or orchestration may be absent from published traces, and legacy request-based subscriptions use a different unit. Every report should identify itself as a dated, counterfactual rate-card comparison—not an invoice forecast.
