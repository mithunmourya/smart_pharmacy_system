const errorMiddleware = require("../../middleware/error.middleware");

describe("Error Middleware", () => {

    let err;
    let req;
    let res;
    let next;

    beforeEach(() => {
        err = new Error("Something went wrong");

        req = {};

        res = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn()
        };

        next = jest.fn();

        // Prevent console.error from printing during the test
        jest.spyOn(console, "error").mockImplementation(() => {});
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });


    // 1. Should log the error
    test("should log the error", () => {
        errorMiddleware(err, req, res, next);

        expect(console.error).toHaveBeenCalledWith(err);
    });


    // 2. Should return 500 status
    test("should return 500 status", () => {
        errorMiddleware(err, req, res, next);

        expect(res.status).toHaveBeenCalledWith(500);
    });


    // 3. Should return correct error response
    test("should return internal server error response", () => {
        errorMiddleware(err, req, res, next);

        expect(res.json).toHaveBeenCalledWith({
            status: 500,
            success: false,
            message: "Internal Server Error.",
            data: null
        });
    });


    // 4. Should not call next
    test("should not call next", () => {
        errorMiddleware(err, req, res, next);

        expect(next).not.toHaveBeenCalled();
    });


    // 5. Should handle different errors
    test("should handle different error objects", () => {
        const anotherError = new Error("Database connection failed");

        errorMiddleware(anotherError, req, res, next);

        expect(console.error).toHaveBeenCalledWith(anotherError);

        expect(res.status).toHaveBeenCalledWith(500);

        expect(res.json).toHaveBeenCalledWith({
            status: 500,
            success: false,
            message: "Internal Server Error.",
            data: null
        });

        expect(next).not.toHaveBeenCalled();
    });

});