import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { and, asc, eq, gte, inArray, lte } from "drizzle-orm";
import { db } from "../src/utils/database";
import { gymTrendCache, revoGymCount, revoGyms } from "../src/db/schema";
import {
    analyzeGymDropouts,
    buildTrendDaysFromLookup,
    confidencePassesThreshold,
    getAuditLocalTime,
    type AuditGym,
    type AuditRow,
    type AuditRunResult,
    type ConfidenceLevel,
    type RepairProposal,
} from "../src/agents/statAudit";

type ConfidenceThreshold = "high" | "medium" | "all";

interface CliOptions {
    apply: boolean;
    dryRun: boolean;
    gymFilter: string | null;
    from: string | null;
    to: string | null;
    minScore: number;
    reportPath: string | null;
    confidence: ConfidenceThreshold;
    verbose: boolean;
    progressEvery: number;
}

interface JsonReport {
    generatedAt: string;
    mode: "dry-run" | "apply";
    filters: {
        gym: string | null;
        from: string | null;
        to: string | null;
        minScore: number;
        confidence: ConfidenceThreshold;
    };
    summary: AuditRunResult["summary"];
    proposals: RepairProposal[];
}

const readFlagValue = (args: string[], flag: string) => {
    const index = args.indexOf(flag);
    if (index === -1) {
        return null;
    }

    return args[index + 1] ?? null;
};

const hasFlag = (args: string[], flag: string) => args.includes(flag);

const parseCliOptions = (args: string[]): CliOptions => {
    const apply = hasFlag(args, "--apply");
    const dryRun = !apply || hasFlag(args, "--dry-run");
    const gymFilter = readFlagValue(args, "--gym");
    const from = readFlagValue(args, "--from");
    const to = readFlagValue(args, "--to");
    const reportPath = readFlagValue(args, "--report");
    const minScoreRaw = readFlagValue(args, "--min-score");
    const confidenceRaw = readFlagValue(args, "--confidence");
    const progressEveryRaw = readFlagValue(args, "--progress-every");
    const verbose = hasFlag(args, "--verbose");

    const minScore = minScoreRaw ? Number.parseFloat(minScoreRaw) : 30;
    const confidence = (confidenceRaw ?? "high") as ConfidenceThreshold;
    const progressEvery = progressEveryRaw ? Number.parseInt(progressEveryRaw, 10) : 25;

    if (!["high", "medium", "all"].includes(confidence)) {
        throw new Error(`Unsupported --confidence value: ${confidenceRaw}`);
    }

    if (!Number.isFinite(minScore)) {
        throw new Error(`Invalid --min-score value: ${minScoreRaw}`);
    }

    if (!Number.isFinite(progressEvery) || progressEvery <= 0) {
        throw new Error(`Invalid --progress-every value: ${progressEveryRaw}`);
    }

    return {
        apply,
        dryRun,
        gymFilter,
        from,
        to,
        minScore,
        reportPath,
        confidence,
        verbose,
        progressEvery,
    };
};

const logVerbose = (options: CliOptions, message: string) => {
    if (options.verbose) {
        console.log(`[StatAudit] ${message}`);
    }
};

const matchesGymFilter = (gym: AuditGym, filter: string | null) => {
    if (!filter) {
        return true;
    }

    const normalizedFilter = filter.trim().toLowerCase();
    return gym.id.toLowerCase() === normalizedFilter || gym.name.toLowerCase().includes(normalizedFilter);
};

const buildCreatedRangeWhere = (options: CliOptions) => {
    const predicates = [];

    if (options.from) {
        predicates.push(gte(revoGymCount.created, `${options.from} 00:00:00`));
    }

    if (options.to) {
        predicates.push(lte(revoGymCount.created, `${options.to} 23:59:59`));
    }

    return predicates.length > 0 ? and(...predicates) : undefined;
};

const withinLocalDateRange = (
    created: string,
    timezone: string,
    from: string | null,
    to: string | null,
) => {
    const localDate = getAuditLocalTime(created, timezone).localDate;

    if (from && localDate < from) {
        return false;
    }

    if (to && localDate > to) {
        return false;
    }

    return true;
};

const mergeSummaries = (
    current: AuditRunResult["summary"],
    next: AuditRunResult["summary"],
): AuditRunResult["summary"] => ({
    gymsScanned: current.gymsScanned + next.gymsScanned,
    daysScanned: current.daysScanned + next.daysScanned,
    rowsInspected: current.rowsInspected + next.rowsInspected,
    suspiciousZerosFound: current.suspiciousZerosFound + next.suspiciousZerosFound,
    fixesProposed: current.fixesProposed + next.fixesProposed,
    fixesApplied: current.fixesApplied + next.fixesApplied,
    rowsSkipped: current.rowsSkipped + next.rowsSkipped,
});

const defaultSummary = (): AuditRunResult["summary"] => ({
    gymsScanned: 0,
    daysScanned: 0,
    rowsInspected: 0,
    suspiciousZerosFound: 0,
    fixesProposed: 0,
    fixesApplied: 0,
    rowsSkipped: 0,
});

const ensureReportPath = async (options: CliOptions, proposals: RepairProposal[]) => {
    if (options.reportPath) {
        const reportFile = resolve(options.reportPath);
        await mkdir(dirname(reportFile), { recursive: true });
        return reportFile;
    }

    if (!options.apply && proposals.length === 0) {
        return null;
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const reportFile = resolve(process.cwd(), "reports", `stat-audit-${timestamp}.json`);
    await mkdir(dirname(reportFile), { recursive: true });
    return reportFile;
};

const writeReport = async (
    reportPath: string,
    options: CliOptions,
    summary: AuditRunResult["summary"],
    proposals: RepairProposal[],
) => {
    const report: JsonReport = {
        generatedAt: new Date().toISOString(),
        mode: options.apply ? "apply" : "dry-run",
        filters: {
            gym: options.gymFilter,
            from: options.from,
            to: options.to,
            minScore: options.minScore,
            confidence: options.confidence,
        },
        summary,
        proposals,
    };

    await Bun.write(reportPath, `${JSON.stringify(report, null, 2)}\n`);
};

const loadGyms = async (gymFilter: string | null): Promise<AuditGym[]> => {
    const gyms = await db
        .select({
            id: revoGyms.id,
            name: revoGyms.name,
            timezone: revoGyms.timezone,
            areaSize: revoGyms.areaSize,
        })
        .from(revoGyms);

    return gyms.filter((gym) => matchesGymFilter(gym, gymFilter));
};

const loadRowsByGym = async (gymIds: string[], options: CliOptions) => {
    const predicates = [inArray(revoGymCount.gymId, gymIds)];
    const createdRange = buildCreatedRangeWhere(options);

    if (createdRange) {
        predicates.push(createdRange);
    }

    const rows = await db
        .select({
            id: revoGymCount.id,
            gymId: revoGymCount.gymId,
            gymName: revoGymCount.gymName,
            created: revoGymCount.created,
            count: revoGymCount.count,
            ratio: revoGymCount.ratio,
            percentage: revoGymCount.percentage,
        })
        .from(revoGymCount)
        .where(and(...predicates))
        .orderBy(asc(revoGymCount.gymId), asc(revoGymCount.created));

    const grouped = new Map<string, AuditRow[]>();

    for (const row of rows) {
        const group = grouped.get(row.gymId) ?? [];
        group.push(row);
        grouped.set(row.gymId, group);
    }

    return grouped;
};

const loadTrendRows = async (gymIds: string[]) => {
    const rows = await db
        .select({
            gymId: gymTrendCache.gymId,
            dayOfWeek: gymTrendCache.dayOfWeek,
            trendData: gymTrendCache.trendData,
        })
        .from(gymTrendCache)
        .where(inArray(gymTrendCache.gymId, gymIds));

    const grouped = new Map<string, Array<{ dayOfWeek: number; slots: any[] }>>();

    for (const row of rows) {
        const group = grouped.get(row.gymId) ?? [];
        group.push({
            dayOfWeek: row.dayOfWeek,
            slots: row.trendData as any[],
        });
        grouped.set(row.gymId, group);
    }

    return grouped;
};

const applyRepairs = async (proposals: RepairProposal[], options: CliOptions) => {
    let applied = 0;

    for (const proposal of proposals) {
        await db
            .update(revoGymCount)
            .set({
                count: proposal.repairedCount,
                ratio: proposal.repairedRatio,
                percentage: proposal.repairedPercentage,
            })
            .where(eq(revoGymCount.id, proposal.rowId));
        applied += 1;

        if (options.verbose && (applied % options.progressEvery === 0 || applied === proposals.length)) {
            console.log(
                `[StatAudit] Applied ${applied}/${proposals.length} repairs ` +
                `(${proposal.gymName} ${proposal.localTimestamp}, ${proposal.repairMethod})`,
            );
        }
    }

    return applied;
};

const printSummary = (
    summary: AuditRunResult["summary"],
    reportPath: string | null,
    options: CliOptions,
) => {
    console.log(`[StatAudit] Mode: ${options.apply ? "apply" : "dry-run"}`);
    if (options.verbose) {
        console.log(`[StatAudit] Verbose: enabled`);
        console.log(`[StatAudit] Progress interval: every ${options.progressEvery} item(s)`);
    }
    console.log(`[StatAudit] Gyms scanned: ${summary.gymsScanned}`);
    console.log(`[StatAudit] Days scanned: ${summary.daysScanned}`);
    console.log(`[StatAudit] Rows inspected: ${summary.rowsInspected}`);
    console.log(`[StatAudit] Suspicious zeros found: ${summary.suspiciousZerosFound}`);
    console.log(`[StatAudit] Fixes proposed: ${summary.fixesProposed}`);
    console.log(`[StatAudit] Fixes applied: ${summary.fixesApplied}`);
    console.log(`[StatAudit] Rows skipped: ${summary.rowsSkipped}`);

    if (reportPath) {
        console.log(`[StatAudit] Report: ${reportPath}`);
    }
};

const main = async () => {
    const options = parseCliOptions(process.argv.slice(2));
    logVerbose(options, "Loading gyms...");
    const gyms = await loadGyms(options.gymFilter);

    if (gyms.length === 0) {
        throw new Error("No gyms matched the provided filters.");
    }

    logVerbose(options, `Matched ${gyms.length} gym(s). Loading history and trend cache...`);
    const gymIds = gyms.map((gym) => gym.id);
    const [rowsByGym, trendsByGym] = await Promise.all([
        loadRowsByGym(gymIds, options),
        loadTrendRows(gymIds),
    ]);

    let summary = defaultSummary();
    const proposals: RepairProposal[] = [];

    for (let index = 0; index < gyms.length; index++) {
        const gym = gyms[index];
        const rows = (rowsByGym.get(gym.id) ?? []).filter((row) =>
            withinLocalDateRange(row.created, gym.timezone, options.from, options.to),
        );
        const trends = buildTrendDaysFromLookup(trendsByGym.get(gym.id) ?? []);
        const result = analyzeGymDropouts(gym, rows, trends, {
            minScore: options.minScore,
        });

        const filteredProposals = result.proposals.filter((proposal) =>
            confidencePassesThreshold(proposal.confidence, options.confidence),
        );

        proposals.push(...filteredProposals);
        summary = mergeSummaries(summary, {
            ...result.summary,
            fixesProposed: filteredProposals.length,
        });

        if (
            options.verbose &&
            ((index + 1) % options.progressEvery === 0 || index === gyms.length - 1)
        ) {
            console.log(
                `[StatAudit] Processed ${index + 1}/${gyms.length} gyms: ${gym.name} ` +
                `(rows=${rows.length}, suspicious=${result.summary.suspiciousZerosFound}, ` +
                `proposed=${filteredProposals.length})`,
            );
        }
    }

    const reportPath = await ensureReportPath(options, proposals);
    if (reportPath) {
        logVerbose(options, `Writing audit report to ${reportPath}...`);
        await writeReport(reportPath, options, summary, proposals);
    }

    if (options.apply) {
        logVerbose(options, `Applying ${proposals.length} repair(s)...`);
        const appliedProposals = proposals.filter((proposal) =>
            confidencePassesThreshold(proposal.confidence as ConfidenceLevel, options.confidence),
        );
        summary.fixesApplied = await applyRepairs(appliedProposals, options);
    }

    printSummary(summary, reportPath, options);
};

main().catch((error) => {
    console.error("[StatAudit] Fatal error:", error);
    process.exitCode = 1;
});
