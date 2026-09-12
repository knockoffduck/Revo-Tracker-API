import { describe, expect, test } from "bun:test";
import type { GymDetails } from "../src/utils/details";
import { detailPageShowsRealGym, locationKey, locationOwners } from "../src/utils/gymVerification";

const detailPage = (fields: Partial<GymDetails>): GymDetails => ({
    squatRacks: null,
    address: null,
    postcode: null,
    state: null,
    areaSize: null,
    ...fields,
});

describe("detailPageShowsRealGym", () => {
    test("accepts an open gym page — floor area, racks and address", () => {
        const forrestdale = detailPage({
            squatRacks: 10,
            areaSize: 2560,
            address: "800 Ranford Road, Forrestdale WA 6112",
            postcode: 6112,
            state: "WA",
        });

        expect(detailPageShowsRealGym(forrestdale)).toBe(true);
    });

    test("accepts a page that only carries a street address", () => {
        const fitzroyNorth = detailPage({
            address: "12 Smith St, Fitzroy North VIC 3068",
            postcode: 3068,
            state: "VIC",
        });

        expect(detailPageShowsRealGym(fitzroyNorth)).toBe(true);
    });

    test("rejects a page with racks but no floor area or address — a gym that moved", () => {
        // Shenton Park's page outlived the gym itself.
        expect(detailPageShowsRealGym(detailPage({ squatRacks: 11 }))).toBe(false);
    });

    test("rejects a missing page (404) and an address without a postcode", () => {
        expect(detailPageShowsRealGym(detailPage({ failure: "HTTP 404 — HTML error page" }))).toBe(false);
        expect(detailPageShowsRealGym(detailPage({ address: "Nowhere in particular" }))).toBe(false);
    });
});

describe("locationKey", () => {
    test("matches a detail page to the record of the gym it replaced", () => {
        const knoxPage = detailPage({ address: "Tenancy 6, 1464 Ferntree Gully Rd, Knoxfield 3180" });
        const knoxfieldRecord = { address: "Tenancy 6, 1464 Ferntree Gully Rd, Knoxfield 3180", postcode: 3180 };

        expect(locationKey(knoxPage)).toBe(locationKey(knoxfieldRecord));
    });

    test("ignores a missing postcode and placeholder addresses", () => {
        expect(locationKey({ address: "800 Ranford Road, Forrestdale WA 6112", postcode: 0 })).toBe(
            locationKey({ address: "800 Ranford Road, Forrestdale WA 6112", postcode: 6112 }),
        );
        expect(locationKey({ address: "Pending Update" })).toBeNull();
        expect(locationKey({ address: "" })).toBeNull();
    });

    test("keeps different addresses apart", () => {
        expect(locationKey({ address: "1 Page Rd, Kelmscott WA 6111" })).not.toBe(
            locationKey({ address: "2 Page Rd, Kelmscott WA 6111" }),
        );
    });
});

describe("locationOwners", () => {
    test("maps each tracked gym's address to the gym that owns it", () => {
        const owners = locationOwners([
            { name: "Kelmscott", address: "1 Page Rd, Kelmscott WA 6111" },
            { name: "Forrestdale", address: "800 Ranford Road, Forrestdale WA 6112" },
            { name: "No address yet", address: "Pending Update" },
        ]);

        expect(owners.size).toBe(2);
        expect(owners.get(locationKey({ address: "800 Ranford Road, Forrestdale WA 6112" })!)).toBe(
            "Forrestdale",
        );
        expect(owners.get(locationKey({ address: "1 Page Rd, Kelmscott WA 6111" })!)).toBe("Kelmscott");
    });
});
