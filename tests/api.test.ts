import { describe, expect, test, mock } from "bun:test";
import app from "../src/index";
import { parseHTML } from "../src/utils/parser";

// Mock Parser
mock.module("../src/utils/parser", () => {
    return {
        // Return a mock gym list
        parseHTML: mock(async () => {
            return [
                {
                    name: "Mock Gym",
                    address: "123 Mock St",
                    postcode: 1234,
                    state: "WA",
                    size: 500,
                    member_count: 50,
                    member_ratio: 10,
                    percentage: 80
                }
            ];
        }),
        insertGymStats: mock(async () => { }),
        updateGymInfo: mock(async () => { })
    };
});

// Mock Database
// This is complex because of chaining.
// db.select().from().orderBy().limit()
mock.module("../src/utils/database", () => {
    const mockDb = {
        select: mock(() => mockDb),
        from: mock(() => mockDb),
        where: mock(() => mockDb),
        orderBy: mock(() => mockDb),
        limit: mock(() => mockDb),
        // When awaiting the query, it returns the result. 
        // In Bun/JS, awaiting an object calls .then() if it exists.
        // Or Drizzle objects are awaitable promises.
        then: (resolve: any) => resolve([
            // Return mock data for /gyms/stats/latest
            { created: new Date(), count: 100, ratio: 5, percentage: 50, gymName: "Mock Gym" }
        ])
    };
    return {
        db: mockDb
    };
});


describe("API Endpoint Tests", () => {

    test("GET / should return 'API Home'", async () => {
        const req = new Request("http://localhost/");
        const res = await app.fetch(req);
        expect(res.status).toBe(200);
        expect(await res.text()).toBe("API Home");
    });

    test("GET /gyms/update should succeed", async () => {
        const req = new Request("http://localhost/gyms/update");
        const res = await app.fetch(req);
        expect(res.status).toBe(200); // handleSuccess returns 200
        const json = await res.json();
        expect(json.message).toBe("Success");
        expect(json.data.message).toContain("Data updated successfully");
    });

    test("GET /gyms/stats/update should succeed", async () => {
        const req = new Request("http://localhost/gyms/stats/update");
        const res = await app.fetch(req);
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.message).toBe("Success");
        expect(json.data.message).toContain("Gym stats updated successfully");
    });

    test("GET /gyms/stats/latest should return data", async () => {
        const req = new Request("http://localhost/gyms/stats/latest");
        const res = await app.fetch(req);
        expect(res.status).toBe(200);
        const json = await res.json();
        // The mock DB returns an array inside data
        expect(Array.isArray(json.data)).toBe(true);
        expect(json.data[0].gymName).toBe("Mock Gym");
    });
});
