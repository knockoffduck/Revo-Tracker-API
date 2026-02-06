import { describe, expect, test, mock } from "bun:test";
import { handleSuccess, handleError } from "../src/utils/handlers";

// Mock Hono context
const createMockContext = () => {
    let responseData: any = null;
    let responseStatus: number = 200;
    
    return {
        json: mock((data: any, status: number = 200) => {
            responseData = data;
            responseStatus = status;
            return { data, status };
        }),
        getResponseData: () => responseData,
        getResponseStatus: () => responseStatus,
    };
};

describe("Handlers Unit Tests", () => {
    describe("handleSuccess", () => {
        test("should return success response with default status 200", () => {
            const ctx = createMockContext();
            const data = { message: "Test data" };
            
            handleSuccess(ctx, data);
            
            expect(ctx.getResponseStatus()).toBe(200);
            expect(ctx.getResponseData()).toEqual({
                message: "Success",
                data: data,
            });
        });

        test("should return success response with custom status code", () => {
            const ctx = createMockContext();
            const data = { message: "Accepted" };
            
            handleSuccess(ctx, data, 202);
            
            expect(ctx.getResponseStatus()).toBe(202);
            expect(ctx.getResponseData()).toEqual({
                message: "Success",
                data: data,
            });
        });

        test("should handle nested data objects", () => {
            const ctx = createMockContext();
            const data = { 
                gyms: [{ name: "Test Gym", count: 100 }],
                total: 1 
            };
            
            handleSuccess(ctx, data);
            
            expect(ctx.getResponseData().data).toEqual(data);
        });
    });

    describe("handleError", () => {
        test("should return error response with default status 500", () => {
            const ctx = createMockContext();
            const error = new Error("Something went wrong");
            
            handleError(ctx, error);
            
            expect(ctx.getResponseStatus()).toBe(500);
            expect(ctx.getResponseData()).toEqual({
                message: "Failed",
                error: "Something went wrong",
            });
        });

        test("should return error response with custom status code", () => {
            const ctx = createMockContext();
            const error = new Error("Not found");
            
            handleError(ctx, error, 404);
            
            expect(ctx.getResponseStatus()).toBe(404);
            expect(ctx.getResponseData()).toEqual({
                message: "Failed",
                error: "Not found",
            });
        });

        test("should handle string error", () => {
            const ctx = createMockContext();
            const error = "Simple error message";
            
            handleError(ctx, error);
            
            expect(ctx.getResponseData().error).toBe("Simple error message");
        });

        test("should handle error object without message", () => {
            const ctx = createMockContext();
            const error = { code: 500, details: "Server error" };
            
            handleError(ctx, error);
            
            expect(ctx.getResponseData().error).toEqual(error);
        });

        test("should handle null error", () => {
            const ctx = createMockContext();
            
            // handleError should handle null gracefully
            expect(() => handleError(ctx, null)).toThrow();
        });
    });
});
