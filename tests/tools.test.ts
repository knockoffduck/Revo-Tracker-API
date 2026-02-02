import { describe, expect, test } from "bun:test";
import { simpleIntegerHash } from "../src/utils/tools";

describe("Tools Unit Tests", () => {
    describe("simpleIntegerHash", () => {
        test("should return a number for a given string", () => {
            const hash = simpleIntegerHash("test-gym");
            expect(typeof hash).toBe("number");
        });

        test("should return consistent values for the same input", () => {
            const hash1 = simpleIntegerHash("perth-city-6000");
            const hash2 = simpleIntegerHash("perth-city-6000");
            expect(hash1).toBe(hash2);
        });

        test("should return different values for different inputs", () => {
            const hash1 = simpleIntegerHash("perth-city-6000");
            const hash2 = simpleIntegerHash("scarborough-6019");
            expect(hash1).not.toBe(hash2);
        });

        test("should stay within 2^24 bounds", () => {
            const largeInput = "very-long-gym-name-with-lots-of-characters-to-trigger-overflows-and-multiple-iterations-of-the-loop";
            const hash = simpleIntegerHash(largeInput);
            expect(hash).toBeGreaterThanOrEqual(0);
            expect(hash).toBeLessThan(Math.pow(2, 24));
        });

        test("should handle empty string", () => {
            const hash = simpleIntegerHash("");
            expect(hash).toBe(0);
        });
    });
});
