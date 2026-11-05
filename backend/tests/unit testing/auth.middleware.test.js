// Load environment variables from .env
require("dotenv").config();

const jwt = require("jsonwebtoken");

jest.mock("../../models/user.model", () => ({
  getUserAuthById: jest.fn()
}));

const userModel = require("../../models/user.model");
const authenticate = require("../../middleware/auth.middleware");


// ============================================================
// AUTHENTICATION MIDDLEWARE TESTS
// ============================================================

describe("authenticate middleware", () => {

  // Each test starts with a clean user-model mock.
  beforeEach(() => {
    userModel.getUserAuthById.mockReset();
  });


  // ----------------------------------------------------------
  // TEST 1: Authorization header is missing
  // ----------------------------------------------------------

  test("should return 401 when Authorization header is missing", async () => {

    // Arrange
    const req = {
      headers: {}
    };

    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };

    const next = jest.fn();


    // Act
    await authenticate(req, res, next);


    // Assert
    expect(res.status).toHaveBeenCalledWith(401);

    expect(res.json).toHaveBeenCalledWith({
      status: 401,
      success: false,
      message: "Access token is required.",
      data: null
    });

    expect(next).not.toHaveBeenCalled();
  });


  // ----------------------------------------------------------
  // TEST 2: Authorization header is not Bearer
  // ----------------------------------------------------------

  test("should return 401 when Authorization header is not Bearer", async () => {

    // Arrange
    const req = {
      headers: {
        authorization: "Basic abc123"
      }
    };

    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };

    const next = jest.fn();


    // Act
    await authenticate(req, res, next);


    // Assert
    expect(res.status).toHaveBeenCalledWith(401);

    expect(res.json).toHaveBeenCalledWith({
      status: 401,
      success: false,
      message: "Access token is required.",
      data: null
    });

    expect(next).not.toHaveBeenCalled();
  });


  // ----------------------------------------------------------
  // TEST 3: Invalid JWT
  // ----------------------------------------------------------

  test("should return 401 when token is invalid", async () => {

    // Arrange
    const req = {
      headers: {
        authorization: "Bearer invalid-token"
      }
    };

    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };

    const next = jest.fn();


    // Act
    await authenticate(req, res, next);


    // Assert
    expect(res.status).toHaveBeenCalledWith(401);

    expect(res.json).toHaveBeenCalledWith({
      status: 401,
      success: false,
      message: "Invalid or expired token.",
      data: null
    });

    expect(userModel.getUserAuthById).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });


  // ----------------------------------------------------------
  // TEST 4: Expired JWT
  // ----------------------------------------------------------

  test("should return 401 when token is expired", async () => {

    // Arrange
    const expiredToken = jwt.sign(
      {
        userId: 1,
        email: "admin@gmail.com",
        role: "Admin",
        token_version: 0
      },
      process.env.JWT_SECRET,
      {
        algorithm: "HS256",
        expiresIn: "-1s"
      }
    );

    const req = {
      headers: {
        authorization: `Bearer ${expiredToken}`
      }
    };

    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };

    const next = jest.fn();


    // Act
    await authenticate(req, res, next);


    // Assert
    expect(res.status).toHaveBeenCalledWith(401);

    expect(res.json).toHaveBeenCalledWith({
      status: 401,
      success: false,
      message: "Invalid or expired token.",
      data: null
    });

    expect(userModel.getUserAuthById).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });


  // ----------------------------------------------------------
  // TEST 5: Valid JWT uses current account details
  // ----------------------------------------------------------

  test("should attach the current account details and call next", async () => {

    // Arrange
    const token = jwt.sign(
      {
        userId: 1,
        email: "old-admin@example.com",
        role: "Admin",
        token_version: 0
      },
      process.env.JWT_SECRET,
      {
        algorithm: "HS256",
        expiresIn: "1h"
      }
    );

    // The token's role and email are stale.
    // The current account values must be used for authorization.
    userModel.getUserAuthById.mockResolvedValueOnce({
      user_id: 1,
      email: "pharmacist@example.com",
      role: "Pharmacist",
      is_active: 1,
      token_version: 0
    });

    const req = {
      headers: {
        authorization: `Bearer ${token}`
      }
    };

    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };

    const next = jest.fn();


    // Act
    await authenticate(req, res, next);


    // Assert
    expect(userModel.getUserAuthById).toHaveBeenCalledWith(1);

    expect(req.user).toEqual({
      userId: 1,
      email: "pharmacist@example.com",
      role: "Pharmacist",
      token_version: 0
    });

    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith();

    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });


  // ----------------------------------------------------------
  // TEST 6: Signed token is missing token_version
  // ----------------------------------------------------------

  test("should return 401 before account lookup when token_version is missing", async () => {

    // Arrange
    const token = jwt.sign(
      {
        userId: 1,
        email: "admin@gmail.com",
        role: "Admin"
      },
      process.env.JWT_SECRET,
      {
        algorithm: "HS256",
        expiresIn: "1h"
      }
    );

    const req = {
      headers: {
        authorization: `Bearer ${token}`
      }
    };

    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };

    const next = jest.fn();


    // Act
    await authenticate(req, res, next);


    // Assert
    expect(res.status).toHaveBeenCalledWith(401);

    expect(res.json).toHaveBeenCalledWith({
      status: 401,
      success: false,
      message: "Your session is no longer valid. Please sign in again.",
      data: null
    });

    expect(userModel.getUserAuthById).not.toHaveBeenCalled();
    expect(req.user).toBeUndefined();
    expect(next).not.toHaveBeenCalled();
  });


  // ----------------------------------------------------------
  // TEST 7: Account no longer exists
  // ----------------------------------------------------------

  test("should return 401 when the account no longer exists", async () => {

    // Arrange
    const token = jwt.sign(
      {
        userId: 3,
        email: "customer@example.com",
        role: "Customer",
        token_version: 0
      },
      process.env.JWT_SECRET,
      {
        algorithm: "HS256",
        expiresIn: "1h"
      }
    );

    userModel.getUserAuthById.mockResolvedValueOnce(null);

    const req = {
      headers: {
        authorization: `Bearer ${token}`
      }
    };

    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };

    const next = jest.fn();


    // Act
    await authenticate(req, res, next);


    // Assert
    expect(userModel.getUserAuthById).toHaveBeenCalledWith(3);
    expect(res.status).toHaveBeenCalledWith(401);

    expect(res.json).toHaveBeenCalledWith({
      status: 401,
      success: false,
      message: "Your account is no longer available.",
      data: null
    });

    expect(req.user).toBeUndefined();
    expect(next).not.toHaveBeenCalled();
  });


  // ----------------------------------------------------------
  // TEST 8: Account is inactive
  // ----------------------------------------------------------

  test("should return 401 for an inactive account even when token versions match", async () => {

    // Arrange
    const token = jwt.sign(
      {
        userId: 3,
        email: "customer@example.com",
        role: "Customer",
        token_version: 1
      },
      process.env.JWT_SECRET,
      {
        algorithm: "HS256",
        expiresIn: "1h"
      }
    );

    userModel.getUserAuthById.mockResolvedValueOnce({
      user_id: 3,
      email: "customer@example.com",
      role: "Customer",
      is_active: 0,
      token_version: 1
    });

    const req = {
      headers: {
        authorization: `Bearer ${token}`
      }
    };

    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };

    const next = jest.fn();


    // Act
    await authenticate(req, res, next);


    // Assert
    expect(userModel.getUserAuthById).toHaveBeenCalledWith(3);
    expect(res.status).toHaveBeenCalledWith(401);

    expect(res.json).toHaveBeenCalledWith({
      status: 401,
      success: false,
      message: "Your account has been deactivated. Please contact the administrator.",
      data: null
    });

    expect(req.user).toBeUndefined();
    expect(next).not.toHaveBeenCalled();
  });


  // ----------------------------------------------------------
  // TEST 9: Old token after account restoration
  // ----------------------------------------------------------

  test("should reject an old token when the restored account has a newer version", async () => {

    // Arrange
    const oldToken = jwt.sign(
      {
        userId: 3,
        email: "customer@example.com",
        role: "Customer",
        token_version: 0
      },
      process.env.JWT_SECRET,
      {
        algorithm: "HS256",
        expiresIn: "1h"
      }
    );

    // The account is active again, but its version is now 1.
    userModel.getUserAuthById.mockResolvedValueOnce({
      user_id: 3,
      email: "customer@example.com",
      role: "Customer",
      is_active: 1,
      token_version: 1
    });

    const req = {
      headers: {
        authorization: `Bearer ${oldToken}`
      }
    };

    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };

    const next = jest.fn();


    // Act
    await authenticate(req, res, next);


    // Assert
    expect(userModel.getUserAuthById).toHaveBeenCalledWith(3);
    expect(res.status).toHaveBeenCalledWith(401);

    expect(res.json).toHaveBeenCalledWith({
      status: 401,
      success: false,
      message: "Your session has been revoked. Please sign in again.",
      data: null
    });

    expect(req.user).toBeUndefined();
    expect(next).not.toHaveBeenCalled();
  });


  // ----------------------------------------------------------
  // TEST 10: Account lookup fails
  // ----------------------------------------------------------

  test("should forward the lookup error instead of responding with 401", async () => {

    // Arrange
    const token = jwt.sign(
      {
        userId: 1,
        email: "admin@gmail.com",
        role: "Admin",
        token_version: 0
      },
      process.env.JWT_SECRET,
      {
        algorithm: "HS256",
        expiresIn: "1h"
      }
    );

    const lookupError = new Error("User lookup failed.");

    userModel.getUserAuthById.mockRejectedValueOnce(lookupError);

    const req = {
      headers: {
        authorization: `Bearer ${token}`
      }
    };

    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };

    const next = jest.fn();


    // Act
    await authenticate(req, res, next);


    // Assert
    expect(userModel.getUserAuthById).toHaveBeenCalledWith(1);
    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith(lookupError);

    expect(req.user).toBeUndefined();
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });

});