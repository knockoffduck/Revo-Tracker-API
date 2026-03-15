# Stat Audit Plan

## Goal
Create a backend maintenance script that scans historical gym occupancy data, detects likely false `0` occupancy readings caused by upstream/API dropouts, and safely repairs only high-confidence anomalies.

## Why We Are Doing This
The occupancy feed occasionally records `count = 0` even when the gym was clearly not empty. This causes several problems:

- The UI can show `Quiet (0%)` when the gym was actually active.
- Historical charts contain sharp artificial drops to zero.
- Aggregates, ratios, percentages, and future analytics are polluted by bad source data.
- These visible errors reduce trust because the rendered chart disagrees with the expected trendline.

We want to correct these datapoints at the data layer so:

- Charts are more accurate.
- Historical and current occupancy are more trustworthy.
- Downstream analytics are less noisy.
- The frontend does not need to special-case obviously broken rows.

## Core Objective
Build a script in the backend API project that:

- Analyzes all `Revo_Gym_Count` history.
- Identifies suspicious zero-value occupancy records.
- Scores confidence using both local neighboring data and expected trend behavior.
- Supports dry-run reporting before any writes.
- Can optionally apply safe fixes to the database.
- Records exactly what was changed and why.

## Detection Strategy
The script should focus on likely dropouts, not all anomalies.

A row should be considered a suspicious dropout candidate when:

- `count = 0`
- The expected occupancy at that time is materially above zero.
- Surrounding samples suggest the gym was active before and/or after the zero point.

Use these signals together:

- Current row `count`
- Previous sample count
- Next sample count
- Expected trend average for that weekday/time slot
- Optional percentage or ratio consistency if available

## Recommended High-Confidence Heuristic
Flag a row as high-confidence suspicious if:

- `count = 0`
- Trend average for that slot is at least `20`
- And either:
- Previous sample is at least `10` and next sample is at least `10`
- Or previous/next samples exist and the zero is a sharp local collapse relative to both neighbors

Suggested anomaly score:

```ts
score =
  trendAverage
  + Math.max(previousCount, 0) * 0.5
  + Math.max(nextCount, 0) * 0.5
```

Suggested confidence model:

- `high`: zero + strong trend + both neighbors active
- `medium`: zero + strong trend + one neighbor active
- `low`: zero + trend only

Only auto-fix `high` confidence by default.

## Repair Strategy
Do not delete rows.

Preferred repair order:

1. If both previous and next valid samples exist, replace `count` using interpolation.
2. Otherwise, if the trend average is strong enough, use the trend average.
3. Recompute `ratio` and `percentage` consistently from the repaired `count`.

Recommended replacement priority:

- Interpolation from adjacent real samples
- Fallback to rounded trend average
- Otherwise leave unchanged and report only

Guardrails:

- Never produce negative values.
- Never exceed a sensible maximum if capacity metadata exists.
- Do not auto-fix rows near opening/closing hours unless confidence is still high.
- Do not auto-fix long runs of zeros blindly; they may represent outages or closures and should be reviewed separately.

## Scope
The script should:

- Process all gyms.
- Process all historical dates.
- Support filtering by gym and date range for targeted runs.
- Support dry-run and apply modes.

The script should not:

- Modify non-zero rows in v1.
- Delete records.
- Change schema unless explicitly needed.
- Silently overwrite data without audit output.

## Required Inputs
The script will need:

- Occupancy history from `Revo_Gym_Count`
- Gym metadata from `Revo_Gyms`
- Trend data per gym and weekday/time slot
- Consistent time-slot normalization, ideally 30-minute buckets to match existing chart/trend behavior

## Time Handling
All comparisons must be done in the gym’s local timezone.

The script should:

- Convert timestamps into the gym’s local day.
- Assign rows to the correct weekday and half-hour slot.
- Compare against trend data for that local weekday/time slot.

This is important because false zeros should be judged against the gym’s own local operating pattern, not server UTC or Perth-only assumptions.

## Implementation Approach
Recommended file:

- `scripts/repair-gym-dropouts.ts`

Recommended phases:

1. Load gym metadata.
2. Load or cache trend data.
3. Iterate gym-by-gym, day-by-day.
4. Normalize readings into local time slots.
5. Detect suspicious zero rows.
6. Generate proposed repairs.
7. In dry-run mode, output report only.
8. In apply mode, write updates and audit records.
9. Print summary statistics.

## Recommended CLI Flags
Support these flags:

- `--dry-run`
- `--apply`
- `--gym <gymNameOrId>`
- `--from <YYYY-MM-DD>`
- `--to <YYYY-MM-DD>`
- `--min-score <number>`
- `--report <path>`
- `--confidence <high|medium|all>`

Default behavior:

- Dry-run
- All gyms
- All history or a reasonable bounded range if the table is huge
- Fix only high-confidence rows when `--apply` is used

## Reporting Requirements
The script should produce a machine-readable report, preferably JSON or CSV, containing:

- Row ID
- Gym ID and gym name
- UTC timestamp
- Local timestamp
- Original count
- Repaired count
- Repair method: `interpolation` or `trend`
- Trend average
- Previous count
- Next count
- Confidence
- Anomaly score
- Reason text

At the end, print totals for:

- Gyms scanned
- Days scanned
- Rows inspected
- Suspicious zeros found
- High-confidence fixes proposed
- Fixes applied
- Rows skipped

## Database Write Requirements
When `--apply` is used:

- Update only rows selected for repair.
- Update `count`.
- Recompute and update `ratio`.
- Recompute and update `percentage`.
- Preserve original values in an audit log or backup table if available.

If no audit table exists, at minimum write a JSON or CSV report before applying changes.

If schema changes are allowed, an ideal audit table would store:

- Row ID
- Gym ID
- Original count
- New count
- Original ratio
- New ratio
- Original percentage
- New percentage
- Method
- Confidence
- Score
- Repaired at
- Repaired by or script version

## Confidence Heuristics
High confidence:

- `count = 0`
- Trend average >= `20`
- Previous >= `10`
- Next >= `10`

Medium confidence:

- `count = 0`
- Trend average >= `20`
- Only one adjacent point strongly supports activity

Low confidence:

- `count = 0`
- Trend average high, but neighbors missing or weak

Default auto-fix policy:

- Apply only high confidence
- Report medium and low without modifying them

## Edge Cases
The script must handle:

- Gyms with sparse data
- Missing trend data
- First or last sample of the day
- Long consecutive zero runs
- Real overnight or late-night quiet periods
- Timezone differences between gyms
- Rows already corrected previously

For consecutive zeros:

- Do not automatically replace an extended block without stronger logic.
- Treat single-point or very short dropouts as best candidates in v1.

## Success Criteria
The script is successful if:

- It identifies obvious false-zero dropouts like the Kelmscott example.
- Dry-run output is reviewable and explains each proposed repair.
- Applied fixes are conservative and auditable.
- Charts no longer show sharp false drops to zero for repaired points.
- The script can be safely rerun without corrupting data.

## v1 Non-Goals
Do not try to solve:

- All anomaly detection
- Non-zero but incorrect values
- Full statistical outlier modeling
- Automatic repair of long outage windows

Version 1 should focus narrowly on false zero dropouts with high confidence.

## One-Sentence Assignment
Build a backend maintenance script that scans historical occupancy data, detects high-confidence false-zero dropouts using local neighboring samples plus trendline deviation, supports dry-run reporting, and safely applies audited repairs to `count`, `ratio`, and `percentage` only when confidence is high.
