import { describe, expect, test, mock } from "bun:test";
import { getSquatRacksCount, getGymDetails } from "../src/utils/details";

// Mock axios
mock.module("axios", () => {
    return {
        default: {
            get: mock(async (url: string, config?: any) => {
                if (url.includes("/claremont")) {
                    return {
                        data: `
                        <html>
                            <body>
                                <p>Davies Road, Claremont WA, 6010</p>
                                <p>With 1,370 square metres of training heaven...</p>
                                <div class="some-container">
                                    <span class="px-3 font-bold text-white">6 Squat racks</span>
                                </div>
                            </body>
                        </html>
                        `
                    };
                }
                if (url.includes("/dayton")) {
                    return {
                        data: `
                        <html>
                            <body>
                                <p>44 Repton Street, Dayton, WA 6055</p>
                                <p>With a huge 1,040 square metres of training heaven...</p>
                                <div>
                                    <span>5 Squat racks</span>
                                </div>
                            </body>
                        </html>
                        `
                    };
                }
                if (url.includes("/charlestown")) {
                    return {
                        data: `
                        <html>
                            <body>
                                <p>Shop G 8042, Charlestown Square 30 Pearson St, Charlestown 2290</p>
                                <p>With 1,200 square meters of your favourite equipment.</p>
                                <div>
                                    <span>10 Squat racks</span>
                                </div>
                            </body>
                        </html>
                        `
                    };
                }
                if (url.includes("/castle-hill")) {
                    return {
                        data: `
                        <html>
                            <body>
                                <p>HomeCo. Castle Hill, 16-18 Victoria Avenue, Castle Hill NSW 2154</p>
                                <p>Gym Overview</p>
                                <p>1,665 sq/m</p>
                                <div>
                                    <span>9 Squat racks</span>
                                </div>
                            </body>
                        </html>
                        `
                    };
                }
                if (url.includes("/shenton-park")) {
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
                if (url.includes("/fallback-gym")) {
                    if (config?.httpsAgent) {
                        throw new Error("Proxy failed");
                    }
                    return {
                        data: `
                        <html>
                            <body>
                                <p>1 Test Street, Suburb WA 6000</p>
                                <p>With 1,000 square metres.</p>
                                <div class="some-container">
                                    <span>4 Squat racks</span>
                                </div>
                            </body>
                        </html>
                        `
                    };
                }
                 if (url.includes("/cockburn")) {
                     // The live page: an announcement naming a street, the year in
                     // the date, and the size in the same breath.
                     return {
                         data: `
                        <html>
                            <body>
                                <p>Our BRAND NEW Cockburn club has officially opened! Located at 635 Beeliar Drive , Cockburn WA.</p>
                                <p>You can still access our original Cockburn club (660 Beeliar Drive). We will let you know when the club is officially closing.</p>
                                <p>A BRAND NEW Cockburn 2.0 is coming on the 7th October 2026. We are moving across the road to 635 Beeliar Drive, Cockburn WA. You can access our current Cockburn club (660 Beeliar Drive) until the new club opens.</p>
                                <div><span>2450 sq/m</span></div>
                                <div><span>13 Squat racks</span></div>
                            </body>
                        </html>
                        `
                     };
                 }
                 if (url.includes("/date-in-prose")) {
                     return {
                         data: `
                        <html>
                            <body>
                                <p>Renew your membership before 9 November 2027.</p>
                                <p>Level 3, 55 Example Road, Perth WA 6000</p>
                            </body>
                        </html>
                        `
                     };
                 }
                 if (url.includes("/error-gym")) {
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

    test("getGymDetails should extract full details for a WA gym", async () => {
        const details = await getGymDetails("Dayton");
        expect(details.squatRacks).toBe(5);
        expect(details.areaSize).toBe(1040);
        expect(details.address).toBe("44 Repton Street, Dayton, WA 6055");
        expect(details.postcode).toBe(6055);
        expect(details.state).toBe("WA");
    });

    test("getGymDetails should extract details for Claremont", async () => {
        const details = await getGymDetails("Claremont");
        expect(details.squatRacks).toBe(6);
        expect(details.areaSize).toBe(1370);
        expect(details.address).toBe("Davies Road, Claremont WA, 6010");
        expect(details.postcode).toBe(6010);
        expect(details.state).toBe("WA");
    });

    test("getGymDetails should handle NSW gym without explicit state code", async () => {
        const details = await getGymDetails("Charlestown");
        expect(details.squatRacks).toBe(10);
        expect(details.areaSize).toBe(1200);
        expect(details.address).toBe("Shop G 8042, Charlestown Square 30 Pearson St, Charlestown 2290");
        expect(details.postcode).toBe(2290);
        expect(details.state).toBeNull();
    });

    test("getGymDetails should extract area size in sq/m format", async () => {
        const details = await getGymDetails("Castle Hill");
        expect(details.squatRacks).toBe(9);
        expect(details.areaSize).toBe(1665);
        expect(details.address).toBe("HomeCo. Castle Hill, 16-18 Victoria Avenue, Castle Hill NSW 2154");
        expect(details.postcode).toBe(2154);
        expect(details.state).toBe("NSW");
    });

    test("getGymDetails should return nulls when nothing found", async () => {
        const details = await getGymDetails("Shenton Park");
        expect(details.squatRacks).toBeNull();
        expect(details.areaSize).toBeNull();
        expect(details.address).toBeNull();
        expect(details.postcode).toBeNull();
        expect(details.state).toBeNull();
    });

    test("getGymDetails should return nulls on error", async () => {
        const details = await getGymDetails("Error Gym");
        expect(details.squatRacks).toBeNull();
        expect(details.areaSize).toBeNull();
        expect(details.address).toBeNull();
        expect(details.postcode).toBeNull();
        expect(details.state).toBeNull();
    });
    test("getGymDetails ignores an announcement paragraph that names a street", async () => {
        // Production stored this paragraph as Cockburn's address, and its "7th
        // October 2026" as the postcode.
        const details = await getGymDetails("Cockburn");
        expect(details.address).toBeNull();
        expect(details.postcode).toBeNull();
        expect(details.areaSize).toBe(2450);
        expect(details.squatRacks).toBe(13);
    });

    test("getGymDetails does not read a year in prose as the postcode", async () => {
        const details = await getGymDetails("Date In Prose");
        expect(details.address).toBe("Level 3, 55 Example Road, Perth WA 6000");
        expect(details.postcode).toBe(6000);
    });

    test("getGymDetails does not fetch a page for a gym Revo no longer publishes", async () => {
        const axios = (await import("axios")).default as any;
        axios.get.mockClear();

        const details = await getGymDetails("Cockburn (Original)");

        expect(details).toEqual({
            squatRacks: null,
            address: null,
            postcode: null,
            state: null,
            areaSize: null,
        });
        expect(axios.get).not.toHaveBeenCalled();
    });
});
