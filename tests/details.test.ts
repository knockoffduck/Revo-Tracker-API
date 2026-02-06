import { describe, expect, test, mock } from "bun:test";
import { getSquatRacksCount } from "../src/utils/details";

// Mock axios
mock.module("axios", () => {
    return {
        default: {
            get: mock(async (url: string) => {
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

    test("getSquatRacksCount should return null on error", async () => {
        const count = await getSquatRacksCount("Error Gym");
        expect(count).toBeNull();
    });
});
