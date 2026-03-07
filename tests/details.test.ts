import { describe, expect, test, mock } from "bun:test";
import { getSquatRacksCount } from "../src/utils/details";

// Mock axios
mock.module("axios", () => {
    return {
        default: {
            get: mock(async (url: string, config?: any) => {
                if (url.includes("claremont")) {
                    return {
                        data: `
                        <html>
                            <body>
                                <div class="some-container">
                                    <span class="px-3 font-bold text-white">6 Squat racks</span>
                                </div>
                            </body>
                        </html>
                        `
                    };
                }
                if (url.includes("shenton-park")) {
                     return {
                        data: `
                        <html>
                            <body>
                                <div>
                                    No racks info here
                                </div>
                            </body>
                        </html>
                        `
                    };
                }
                if (url.includes("fallback-gym")) {
                    if (config?.httpsAgent) {
                        throw new Error("Proxy failed");
                    }
                    return {
                        data: `
                        <html>
                            <body>
                                <div class="some-container">
                                    <span>4 Squat racks</span>
                                </div>
                            </body>
                        </html>
                        `
                    };
                }
                 if (url.includes("error-gym")) {
                     throw new Error("404 Not Found");
                }
                return { data: "" };
            })
        }
    };
});

describe("Details Scraper", () => {
    test("getSquatRacksCount should extract number correctly", async () => {
        const count = await getSquatRacksCount("Claremont");
        expect(count).toBe(6);
    });

    test("getSquatRacksCount should return null if not found", async () => {
        const count = await getSquatRacksCount("Shenton Park");
        expect(count).toBeNull();
    });

    test("getSquatRacksCount should fall back to direct connection when proxy fails", async () => {
        const originalDomainName = process.env.DOMAIN_NAME;
        const originalProxyPort = process.env.PROXY_PORT;
        const originalProxyUsername = process.env.PROXY_USERNAME;
        const originalProxyPassword = process.env.PROXY_PASSWORD;

        process.env.DOMAIN_NAME = "proxy.example.com";
        process.env.PROXY_PORT = "80";
        process.env.PROXY_USERNAME = "user";
        process.env.PROXY_PASSWORD = "pass";

        try {
            const count = await getSquatRacksCount("Fallback Gym");
            expect(count).toBe(4);
        } finally {
            if (originalDomainName === undefined) delete process.env.DOMAIN_NAME;
            else process.env.DOMAIN_NAME = originalDomainName;

            if (originalProxyPort === undefined) delete process.env.PROXY_PORT;
            else process.env.PROXY_PORT = originalProxyPort;

            if (originalProxyUsername === undefined) delete process.env.PROXY_USERNAME;
            else process.env.PROXY_USERNAME = originalProxyUsername;

            if (originalProxyPassword === undefined) delete process.env.PROXY_PASSWORD;
            else process.env.PROXY_PASSWORD = originalProxyPassword;
        }
    });

    test("getSquatRacksCount should return null on error", async () => {
        const count = await getSquatRacksCount("Error Gym");
        expect(count).toBeNull();
    });
});
