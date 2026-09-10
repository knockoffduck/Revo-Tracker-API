import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { ClientResponseError } from "pocketbase";
import { describeError, resolveAlert, sendAlert, setAlertTransport } from "../src/utils/alerts";

// Capture rendered messages instead of posting them to Telegram.
const sent: string[] = [];

beforeEach(() => {
    sent.length = 0;
    setAlertTransport(async (message) => {
        sent.push(message);
        return true;
    });
});

afterEach(() => {
    setAlertTransport(null); // restore Telegram delivery for other suites
});

const pocketBaseError = (status: number, response: Record<string, unknown>) =>
    new ClientResponseError({
        url: "https://pb.test/api/collections/Revo_Gym_Count/records",
        status,
        response,
    });

describe("describeError", () => {
    test("names the PocketBase status, its own message, and what that means", () => {
        const described = describeError(
            pocketBaseError(403, { message: "Only superusers can perform this action." }),
        );

        expect(described).toContain("HTTP 403");
        expect(described).toContain("Only superusers can perform this action.");
        expect(described).toContain("admin token was rejected");
        expect(described).toContain("/api/collections/Revo_Gym_Count/records");
    });

    test("reports which fields PocketBase rejected", () => {
        const described = describeError(
            pocketBaseError(400, {
                message: "Failed to create record.",
                data: { gym_id_rel: { code: "validation_relation", message: "Invalid relation." } },
            }),
        );

        expect(described).toContain("Failed to create record.");
        expect(described).toContain("gym_id_rel: Invalid relation. (validation_relation)");
    });

    test("reads network errno, timeouts, MySQL codes and error chains", () => {
        const refused = Object.assign(new Error("connect ECONNREFUSED"), {
            isAxiosError: true,
            code: "ECONNREFUSED",
        });
        expect(describeError(refused)).toContain("connection refused");

        const timeout = new Error("The operation was aborted due to timeout");
        timeout.name = "TimeoutError";
        expect(describeError(timeout)).toContain("no response before the timeout");

        const mysql = Object.assign(new Error("Duplicate entry '42' for key 'PRIMARY'"), {
            code: "ER_DUP_ENTRY",
            sqlMessage: "Duplicate entry '42' for key 'PRIMARY'",
        });
        const describedMysql = describeError(mysql);
        expect(describedMysql).toContain("MySQL ER_DUP_ENTRY");
        expect(describedMysql).toContain("SQL: Duplicate entry");

        const cause = Object.assign(new Error("getaddrinfo ENOTFOUND pb.dvcklab.work"), {
            code: "ENOTFOUND",
        });
        expect(describeError(new Error("fetch failed", { cause }))).toContain("caused by DNS lookup failed");

        expect(describeError(undefined)).toBe("no error detail provided");
    });

    test("summarises an HTML error page instead of quoting it", () => {
        const described = describeError(
            Object.assign(new Error("Request failed with status code 404"), {
                isAxiosError: true,
                response: { status: 404, data: "<!DOCTYPE html><html><body>Not found</body></html>" },
                config: { url: "https://revofitness.com.au/gyms/no-such-gym/" },
            }),
        );

        expect(described).toContain("HTTP 404");
        expect(described).toContain("HTML error page");
        expect(described).not.toContain("DOCTYPE");
    });
});

describe("alert delivery", () => {
    test("sends the first occurrence, suppresses repeats, then reports recovery", async () => {
        await sendAlert({
            key: "test.dedupe",
            severity: "error",
            title: "Scrape returned no gym counts",
            details: "10/10 cookies returned 0 gyms, 10 failed at the network level",
            hint: "check Scraper/cookies.json",
        });

        expect(sent).toHaveLength(1);
        expect(sent[0]).toContain("Scrape returned no gym counts");
        expect(sent[0]).toContain("10/10 cookies returned 0 gyms");
        expect(sent[0]).toContain("check Scraper/cookies.json");
        expect(sent[0]).toContain("first occurrence");

        await sendAlert({ key: "test.dedupe", severity: "error", title: "Scrape returned no gym counts" });
        expect(sent).toHaveLength(1); // still inside the cooldown window

        await resolveAlert("test.dedupe");
        expect(sent).toHaveLength(2);
        expect(sent[1]).toContain("RESOLVED");
        expect(sent[1]).toContain("2 failing attempts");

        await resolveAlert("test.dedupe");
        expect(sent).toHaveLength(2); // nothing left to resolve
    });

    test("carries the classified cause and escapes HTML from scraped names", async () => {
        await sendAlert({
            key: "test.escape",
            severity: "error",
            title: "Snapshot wrote no rows — <script>alert(1)</script> gym rejected",
            error: pocketBaseError(403, { message: "Only superusers can perform this action." }),
        });

        expect(sent[0]).toContain("&lt;script&gt;");
        expect(sent[0]).not.toContain("<script>");
        expect(sent[0]).toContain("HTTP 403");
        expect(sent[0]).toContain("admin token was rejected");

        await resolveAlert("test.escape");
    });
});
