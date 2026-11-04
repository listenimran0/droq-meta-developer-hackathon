# Muse eval results

Run against the deployed `ai-narrator` on 2026-11-04, 26 scenarios, throwaway users (deleted afterwards).

## Summary

- Passed: **26/26** (failed: 0)
- Fallback responses (model unavailable or empty): **0** (0%)
- Latency, text and agent actions (excluding images): p50 **7494 ms**, p95 **13104 ms**
- Tokens reported by the model API: **27531** over 26 calls; images generated: 2
- Estimated cost: **not estimated** - no published per-token / per-image price was supplied (set MUSE_USD_PER_M_TOKENS and MUSE_USD_PER_IMAGE to compute it). Token counts above are measured.

## Assertions checked on every non-fallback response

- valid schema for the action; quest stop ids come from the candidate set, no duplicates, 1-3 stops, at most one Sponsored stop
- no coordinates (decimal degrees) anywhere in the output
- none of the demo drops' real content strings appear in any output (the model only receives metadata)

## By action

| Action | n | p50 ms | max ms | tokens | fallbacks |
|---|---|---|---|---|---|
| sense_reason | 4 | 6229 | 8222 | 1509 | 0 |
| hunt_hint | 5 | 6222 | 10347 | 1797 | 0 |
| clue_options | 4 | 7357 | 8988 | 2852 | 0 |
| found_epilogue | 3 | 4072 | 4099 | 871 | 0 |
| quest_plan | 5 | 9818 | 10807 | 16503 | 0 |
| business_brief | 3 | 13104 | 14023 | 3999 | 0 |
| found_card | 2 | 13247 | 13247 | 0 | 0 |

## Scenarios

| Scenario | Result | ms | Notes |
|---|---|---|---|
| sense en plain | pass | 8222 |  |
| sense en business | pass | 4512 |  |
| sense bn plain | pass | 6229 |  |
| sense bn business | pass | 5629 |  |
| hint level 1 en | pass | 4065 |  |
| hint level 2 en | pass | 7494 |  |
| hint level 3 en | pass | 10347 |  |
| hint level 4 en | pass | 4454 |  |
| hint level 2 bn | pass | 6222 |  |
| clue plain en | pass | 6748 |  |
| clue plain bn | pass | 8988 |  |
| clue business offer | pass | 7357 |  |
| clue risky draft | pass | 7065 | safety=blocked |
| epilogue en | pass | 4072 |  |
| epilogue bn | pass | 4099 |  |
| epilogue business | pass | 2959 |  |
| quest chill morning | pass | 8197 | engine=agent, tools=6, sponsored=1 |
| quest brave evening | pass | 10807 | engine=agent, tools=6, sponsored=1 |
| quest curious afternoon bn | pass | 8879 | engine=agent, tools=6, sponsored=1 |
| quest chill night | pass | 9818 | engine=agent, tools=6, sponsored=1 |
| quest no mood | pass | 9944 | engine=agent, tools=6, sponsored=1 |
| brief en | pass | 14023 |  |
| brief bn | pass | 12191 |  |
| brief no audience | pass | 13104 | no audience |
| image memory | pass | 12177 | b64 |
| image secret | pass | 13247 | b64 |
