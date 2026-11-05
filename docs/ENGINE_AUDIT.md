# Engine audit

This audit checks **engineering behaviour** on synthetic data. It does not show clinical validity, and none is claimed. Every number below is reproducible: `npx tsx scripts/audit-engine.ts` (40 seeds per scenario). The regression thresholds live in `tests/scenarios.test.ts` (30 seeds).

## Scenarios

The generator is `tests/scenarios.ts`: a seeded PRNG, Gaussian noise on 1–10 scales rounded to whole numbers, and optional shifts, gaps and tags. Each evaluation is **rolling**: on day *k* the engine sees only days ≤ *k*.

## Findings and fixes

| # | Finding (before) | Fix | After |
|---|---|---|---|
| 1 | On stable data, 6.1% of days showed a "notice/act" alarm; at noise SD 2 it was 19.3%. The main cause was the energy-vs-stress "scissors" signal, which used raw slopes. | Slopes are now measured in the person's own spread. Scissors also requires both metrics to already be outside the usual range. Sustained stress requires both persistence *and* magnitude. Sleep slide requires 3 short nights out of 5. | 2.9% (SD 1), 5.1% (SD 2) |
| 2 | Context effects used a z-like cutoff with no correction for small samples or for running many tests (~40 per person). Random tags showed as "medium" confidence 0.5× per user. | Welch's t-test with a real t-distribution p-value (Welch–Satterthwaite df), plus Benjamini–Hochberg FDR across *all* tests run. Labels: high = q < 0.01 and n ≥ 6; medium = q < 0.05 and n ≥ 4; "early hint" = q < 0.10. The effect-size floor is kept. | 0.125 shown per user, 0.025 medium |
| 3 | Sleep links accepted \|r\| ≥ 0.25 with n ≥ 8 (p ≈ 0.55). Weekday patterns used no test at all. | Correlation p-value plus BH, with n ≥ 10. Weekdays use Welch plus BH across the 7 days. | Spurious sleep links fell from 0.125 to 0.025 per user |
| 4 | **Baseline leakage:** with fewer than 3 historical days, the fallback put *today* into its own baseline. | The baseline now never includes `asOf`. With almost no history, the population prior carries it. | Tested: today's value can't change today's baseline |
| 5 | The 35-day baseline **absorbs slow change**, so a gradual decline could become the new "usual" (a false negative). | New long-horizon drift check: median of the last 14 days vs. an anchor 6–17 weeks back (Welch p < 0.01 and a shift of at least 0.9 × spread). | Fires in ≥ 80% of seeds for a slow +2.5 rise |
| 6 | An established user with no recent check-ins was shown "Getting to know you". | New state `no-recent` that says how long it has been. | Tested |
| 7 | Confidence depended only on history length and freshness. | Also scales by metric coverage and whether the recent window has more than one day. Labelled in code as a **heuristic, not a probability**. | Tested: confidence drops when metrics are missing |
| 8 | Recovery episodes that spanned check-in gaps reported inflated durations (6 days became 15 with a 12-day gap). | Episodes record `maxGap`. A gap over 3 days marks the episode `uncertain` and leaves it out of "typical". | Tested |
| 9 | A single rough day counted as a "harder stretch", which pulled "typical recovery" down. | An episode now needs 2 consecutive check-ins above the threshold, or 1 severe day. | Tested |
| 10 | Future-dated or out-of-order days could become "latest" or reach the radar. | Pulse and radar ignore days after `asOf`. The strain series sorts its input. | Tested |
| 11 | **Demo and real data were mixed:** "Load demo data" wiped the real user's data, and demo memories were labelled as the user's. | Fixed in the multi-user work: demo data lives only in separate demo accounts. See `SECURITY.md`. | Tested |

## Detection performance (synthetic)

| Scenario | Detected | Delay |
|---|---|---|
| Abrupt +2.5 stress (stress only) | 40/40 | median 2 days. **Tail:** a few seeds take 8–15 days, because a single-metric shift moves composite strain only a little. |
| Gradual +3 stress over 60 days | 40/40 | median 20 days after onset |
| Gradual −1.5 h sleep over 50 days | 39/40 | median 12 days |

## Remaining statistical limitations

- **Days are not independent.** Bad weeks cluster, and that autocorrelation makes the t-tests somewhat over-confident. FDR control reduces this problem but doesn't remove it.
- **Confounding.** Tags co-occur (deadline with poor sleep, for example). Effects are marginal associations and are worded that way, never as causes.
- **Weights and thresholds are hand-chosen** (strain weights, START = 1.2, alarm cut-offs). They're tuned for a low false-alarm rate on synthetic data and haven't been calibrated on real users.
- **"Confidence" is a heuristic** for how much data backs a reading. It isn't a statistical probability.
- Gentle (non-alarm) signals still show on about 5% of stable days each, by design. They're worded as observations and never raise nudges.
- Behaviour on real human data is **unknown**. A validation study would need real, consented data and outcome measures.
