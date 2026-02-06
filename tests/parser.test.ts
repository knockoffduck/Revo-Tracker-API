import { describe, expect, test, mock, beforeAll, afterAll } from "bun:test";
import axios from "axios";
import { file } from "bun";
import path from "path";

// Mock Axios
mock.module("axios", () => {
    return {
        default: {
            get: mock(async () => {
                // Read the mock HTML file
                const mockHtmlPath = path.join(import.meta.dir, "mocks", "gym_site.html");
                const mockHtml = await file(mockHtmlPath).text();

                return {
                    data: mockHtml,
                    status: 200,
                };
            }),
        },
    };
});

// Mock Database
mock.module("../src/utils/database", () => {
    const mockDb = {
        select: mock(() => mockDb),
        from: mock(() => mockDb),
        where: mock(() => mockDb),
        orderBy: mock(() => mockDb),
        limit: mock(() => mockDb),
        insert: mock(() => mockDb),
        values: mock(() => mockDb),
        onDuplicateKeyUpdate: mock(() => mockDb),
        // Handle database results for revoGyms
        then: (resolve: any) => {
            // Check if we are selecting from revoGyms (simplified)
            resolve([
                { name: "Perth City", address: "123 Hay St, Perth", postcode: 6000, state: "WA", areaSize: 1500 },
                { name: "Scarborough", address: "555 Coast Rd, Scarborough", postcode: 6019, state: "WA", areaSize: 2000 },
                { name: "Claremont", address: "10 Bay View Tce, Claremont", postcode: 6010, state: "WA", areaSize: 1000 }
            ]);
        }
    };
    return {
        db: mockDb
    };
});

describe("Parser tests", () => {
    test("parseHTML should correctly extract gym data from mock HTML", async () => {
        // Dynamic import to ensure mocks are applied
        const { parseHTML } = await import("../src/utils/parser");
        
        const gymData = await parseHTML();

        // We expect 3 gyms based on our mock HTML
        expect(gymData).toBeDefined();
        expect(gymData?.length).toBe(3);

        const perthCity = gymData?.find(gym => gym.name === "Perth City");
        expect(perthCity).toBeDefined();
        expect(perthCity?.address).toContain("123 Hay St, Perth");
        expect(perthCity?.postcode).toBe(6000);
        expect(perthCity?.state).toBe("WA");
        expect(perthCity?.size).toBe(1500);
        expect(perthCity?.member_count).toBe(150);
        // Ratio: 1500 / 150 = 10
        expect(perthCity?.member_ratio).toBe(10); 

        const scarborough = gymData?.find(gym => gym.name === "Scarborough");
        expect(scarborough?.member_count).toBe(400);
        expect(scarborough?.size).toBe(2000);
        // Ratio: 2000 / 400 = 5
        expect(scarborough?.member_ratio).toBe(5);

        const claremont = gymData?.find(gym => gym.name === "Claremont");
        expect(claremont).toBeDefined();
        expect(claremont?.size).toBe(1000);
        expect(claremont?.member_count).toBe(50);
        // Ratio: 1000 / 50 = 20
        expect(claremont?.member_ratio).toBe(20);
    });

    test("Handling of missing data", async () => {
        // We can add another test case or modify mock behavior dynamically if needed
        // For now, the mock is static.
    });
});
