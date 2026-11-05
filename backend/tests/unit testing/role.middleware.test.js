const authorize = require("../../middleware/role.middleware");

describe("Role Middleware - Authorization", () => {

    let req;
    let res;
    let next;

    beforeEach(() => {
        req = {
            user: {}
        };

        res = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn()
        };

        next = jest.fn();
    });


    // 1. User context missing
    test("should return 401 when user context is missing", () => {
        req.user = undefined;

        const middleware = authorize("Admin");

        middleware(req, res, next);

        expect(res.status).toHaveBeenCalledWith(401);

        expect(res.json).toHaveBeenCalledWith({
            status: 403,
            success: false,
            message: "User context missing. Authentication required.",
            data: null
        });

        expect(next).not.toHaveBeenCalled();
    });


    // 2. User role missing
    test("should return 401 when user role is missing", () => {
        req.user = {};

        const middleware = authorize("Admin");

        middleware(req, res, next);

        expect(res.status).toHaveBeenCalledWith(401);

        expect(res.json).toHaveBeenCalledWith({
            status: 403,
            success: false,
            message: "User context missing. Authentication required.",
            data: null
        });

        expect(next).not.toHaveBeenCalled();
    });


    // 3. User has wrong role
    test("should return 403 when user does not have required role", () => {
        req.user = {
            userId: 2,
            role: "Customer"
        };

        const middleware = authorize("Admin");

        middleware(req, res, next);

        expect(res.status).toHaveBeenCalledWith(403);

        expect(res.json).toHaveBeenCalledWith({
            status: 403,
            success: false,
            message: "You are not authorized to access this resource.",
            data: null
        });

        expect(next).not.toHaveBeenCalled();
    });


    // 4. User has allowed role
    test("should call next when user has the required role", () => {
        req.user = {
            userId: 1,
            role: "Admin"
        };

        const middleware = authorize("Admin");

        middleware(req, res, next);

        expect(next).toHaveBeenCalledTimes(1);

        expect(res.status).not.toHaveBeenCalled();
        expect(res.json).not.toHaveBeenCalled();
    });


    // 5. Multiple allowed roles
    test("should call next when user has one of multiple allowed roles", () => {
        req.user = {
            userId: 3,
            role: "Pharmacist"
        };

        const middleware = authorize("Admin", "Pharmacist");

        middleware(req, res, next);

        expect(next).toHaveBeenCalledTimes(1);

        expect(res.status).not.toHaveBeenCalled();
        expect(res.json).not.toHaveBeenCalled();
    });

});