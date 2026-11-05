
require("dotenv").config();

const request = require("supertest");
const jwt = require("jsonwebtoken");

// Mock user model for authentication
jest.mock("../../models/user.model", () => ({
  getUserAuthById: jest.fn()
}));

// Mock user service
jest.mock("../../services/user.service");

const userModel = require("../../models/user.model");
const userService = require("../../services/user.service");
const app = require("../../app");

// ============================================================
// MOCK USER DATABASE
// ============================================================

const currentUsers = {
  1: {
    user_id: 1,
    email: "admin@gmail.com",
    role: "Admin",
    is_active: 1,
    token_version: 0
  },
  2: {
    user_id: 2,
    email: "customer@gmail.com",
    role: "Customer",
    is_active: 1,
    token_version: 0
  },
  3: {
    user_id: 3,
    email: "pharmacist@gmail.com",
    role: "Pharmacist",
    is_active: 1,
    token_version: 0
  }
};

beforeEach(() => {
  jest.clearAllMocks();

  userModel.getUserAuthById.mockImplementation(
    async (userId) => {
      return currentUsers[userId] ?? null;
    }
  );
});

// ============================================================
// TEST DATA - JWT TOKENS
// ============================================================

const adminToken = jwt.sign(
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

const customerToken = jwt.sign(
  {
    userId: 2,
    email: "customer@gmail.com",
    role: "Customer",
    token_version: 0
  },
  process.env.JWT_SECRET,
  {
    algorithm: "HS256",
    expiresIn: "1h"
  }
);

const pharmacistToken = jwt.sign(
  {
    userId: 3,
    email: "pharmacist@gmail.com",
    role: "Pharmacist",
    token_version: 0
  },
  process.env.JWT_SECRET,
  {
    algorithm: "HS256",
    expiresIn: "1h"
  }
);

// ============================================================
// REGISTER
// ============================================================

describe("POST /users/register", () => {

  test("should register user successfully", async () => {

    // Arrange
    userService.registerUser.mockResolvedValue({
      status: 201,
      success: true,
      message: "User registered successfully.",
      data: {
        userId: 1
      }
    });

    // Act
    const response = await request(app)
      .post("/users/register")
      .send({
        name: "Mithun",
        email: "mithun@gmail.com",
        password: "Password123",
        role: "Admin"
      });

    // Assert
    expect(response.status).toBe(201);

    expect(response.body.success).toBe(true);

    expect(response.body.message).toBe(
      "User registered successfully."
    );

    expect(response.body.data.userId).toBe(1);

    expect(userService.registerUser).toHaveBeenCalledWith({
      name: "Mithun",
      email: "mithun@gmail.com",
      password: "Password123",
      role: "Admin"
    });
  });


  test("should return 409 when email is already registered", async () => {

    // Arrange
    userService.registerUser.mockResolvedValue({
      status: 409,
      success: false,
      message: "Email is already registered."
    });

    // Act
    const response = await request(app)
      .post("/users/register")
      .send({
        name: "Mithun",
        email: "existing@gmail.com",
        password: "Password123",
        role: "Admin"
      });

    // Assert
    expect(response.status).toBe(409);

    expect(response.body.success).toBe(false);

    expect(response.body.message).toBe(
      "Email is already registered."
    );
  });


  test("should return 409 when user account is inactive", async () => {

    // Arrange
    userService.registerUser.mockResolvedValue({
      status: 409,
      success: false,
      message: "User account is inactive. Please contact the administrator."
    });

    // Act
    const response = await request(app)
      .post("/users/register")
      .send({
        name: "Mithun",
        email: "inactive@gmail.com",
        password: "Password123",
        role: "Admin"
      });

    // Assert
    expect(response.status).toBe(409);

    expect(response.body.success).toBe(false);

    expect(response.body.message).toBe(
      "User account is inactive. Please contact the administrator."
    );
  });

});

// ============================================================
// LOGIN
// ============================================================

describe("POST /users/login", () => {

  test("should login successfully", async () => {

    // Arrange
    userService.loginUser.mockResolvedValue({
      status: 200,
      success: true,
      message: "Login successful.",
      data: {
        token: "fake-jwt-token",
        user: {
          user_id: 1,
          name: "Mithun",
          email: "mithun@gmail.com",
          role: "Admin"
        }
      }
    });

    // Act
    const response = await request(app)
      .post("/users/login")
      .send({
        email: "mithun@gmail.com",
        password: "Password123"
      });

    // Assert
    expect(response.status).toBe(200);

    expect(response.body.success).toBe(true);

    expect(response.body.message).toBe(
      "Login successful."
    );

    expect(response.body.data.token).toBe(
      "fake-jwt-token"
    );

    expect(response.body.data.user.email).toBe(
      "mithun@gmail.com"
    );

    expect(userService.loginUser).toHaveBeenCalledWith(
      "mithun@gmail.com",
      "Password123"
    );
  });


  test("should return 401 when email is not registered", async () => {

    // Arrange
    userService.loginUser.mockResolvedValue({
      status: 401,
      success: false,
      message: "Email is not registered."
    });

    // Act
    const response = await request(app)
      .post("/users/login")
      .send({
        email: "wrong@gmail.com",
        password: "Password123"
      });

    // Assert
    expect(response.status).toBe(401);

    expect(response.body.success).toBe(false);

    expect(response.body.message).toBe(
      "Email is not registered."
    );
  });


  test("should return 409 when account is inactive", async () => {

    // Arrange
    userService.loginUser.mockResolvedValue({
      status: 409,
      success: false,
      message: "User account is inactive. Please contact the administrator."
    });

    // Act
    const response = await request(app)
      .post("/users/login")
      .send({
        email: "inactive@gmail.com",
        password: "Password123"
      });

    // Assert
    expect(response.status).toBe(409);

    expect(response.body.success).toBe(false);

    expect(response.body.message).toBe(
      "User account is inactive. Please contact the administrator."
    );
  });


  test("should return 401 when password is incorrect", async () => {

    // Arrange
    userService.loginUser.mockResolvedValue({
      status: 401,
      success: false,
      message: "Incorrect password."
    });

    // Act
    const response = await request(app)
      .post("/users/login")
      .send({
        email: "mithun@gmail.com",
        password: "WrongPassword"
      });

    // Assert
    expect(response.status).toBe(401);

    expect(response.body.success).toBe(false);

    expect(response.body.message).toBe(
      "Incorrect password."
    );
  });

});

// ============================================================
// GET ALL USERS
// ============================================================

describe("GET /users", () => {

  test("should return 401 when token is missing", async () => {

    const response = await request(app)
      .get("/users");

    expect(response.status).toBe(401);

    expect(response.body.success).toBe(false);
  });


  test("should return 403 when user is not Admin", async () => {

    userService.getAllUsers.mockResolvedValue({
      status: 200,
      success: true,
      message: "Users retrieved successfully.",
      data: []
    });

    const response = await request(app)
      .get("/users")
      .set("Authorization", `Bearer ${customerToken}`);

    expect(response.status).toBe(403);

    expect(response.body.success).toBe(false);

    // Service should never be called
    expect(userService.getAllUsers).not.toHaveBeenCalled();
  });


  test("should return users when Admin token is provided", async () => {

    userService.getAllUsers.mockResolvedValue({
      status: 200,
      success: true,
      message: "Users retrieved successfully.",
      data: [
        {
          user_id: 1,
          name: "Mithun",
          email: "mithun@gmail.com",
          role: "Admin"
        }
      ]
    });

    const response = await request(app)
      .get("/users")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(response.status).toBe(200);

    expect(response.body.success).toBe(true);

    expect(response.body.message).toBe(
      "Users retrieved successfully."
    );

    expect(userService.getAllUsers).toHaveBeenCalled();
  });

});

// ============================================================
// GET USER BY ID
// ============================================================

describe("GET /users/:userId", () => {

  test("should return 401 when token is missing", async () => {

    const response = await request(app)
      .get("/users/1");

    expect(response.status).toBe(401);
  });


  test("should return 403 when user is not Admin", async () => {

    const response = await request(app)
      .get("/users/1")
      .set("Authorization", `Bearer ${customerToken}`);

    expect(response.status).toBe(403);

    expect(userService.getUserById).not.toHaveBeenCalled();
  });


  test("should return user when Admin token is provided", async () => {

    userService.getUserById.mockResolvedValue({
      status: 200,
      success: true,
      message: "User retrieved successfully.",
      data: {
        user_id: 1,
        name: "Mithun",
        email: "mithun@gmail.com",
        role: "Admin"
      }
    });

    const response = await request(app)
      .get("/users/1")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(response.status).toBe(200);

    expect(response.body.success).toBe(true);

    expect(response.body.data.user_id).toBe(1);

    expect(userService.getUserById).toHaveBeenCalledWith(1);
  });


  test("should return 400 for invalid user ID", async () => {

    const response = await request(app)
      .get("/users/abc")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(response.status).toBe(400);

    expect(response.body.success).toBe(false);

    expect(userService.getUserById).not.toHaveBeenCalled();
  });

});

// ============================================================
// CHANGE PASSWORD
// ============================================================

describe("PATCH /users/change-password", () => {

  test("should return 401 when token is missing", async () => {

    const response = await request(app)
      .patch("/users/change-password")
      .send({
        currentPassword: "OldPassword",
        newPassword: "NewPassword"
      });

    expect(response.status).toBe(401);
  });


  test("should change password successfully", async () => {

    userService.changePassword.mockResolvedValue({
      status: 200,
      success: true,
      message: "Password changed successfully."
    });

    const response = await request(app)
      .patch("/users/change-password")
      .set("Authorization", `Bearer ${customerToken}`)
      .send({
        currentPassword: "OldPassword",
        newPassword: "NewPassword"
      });

    expect(response.status).toBe(200);

    expect(response.body.success).toBe(true);

    expect(userService.changePassword).toHaveBeenCalledWith(
      2,
      "OldPassword",
      "NewPassword"
    );
  });

});

// ============================================================
// UPDATE USER
// ============================================================

describe("PUT /users/:userId", () => {

  test("should return 401 when token is missing", async () => {

    const response = await request(app)
      .put("/users/1")
      .send({
        name: "Updated Name",
        email: "updated@gmail.com"
      });

    expect(response.status).toBe(401);
  });


  test("should return 403 when user is not Admin", async () => {

    const response = await request(app)
      .put("/users/1")
      .set("Authorization", `Bearer ${customerToken}`)
      .send({
        name: "Updated Name",
        email: "updated@gmail.com"
      });

    expect(response.status).toBe(403);

    expect(userService.updateUser).not.toHaveBeenCalled();
  });


  test("should update user successfully", async () => {

    userService.updateUser.mockResolvedValue({
      status: 200,
      success: true,
      message: "User updated successfully."
    });

    const response = await request(app)
      .put("/users/1")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        name: "Updated Name",
        email: "updated@gmail.com"
      });

    expect(response.status).toBe(200);

    expect(response.body.success).toBe(true);

    expect(userService.updateUser).toHaveBeenCalledWith(
      1,
      {
        name: "Updated Name",
        email: "updated@gmail.com"
      }
    );
  });

});

// ============================================================
// CHANGE ROLE
// ============================================================

describe("PATCH /users/:userId/role", () => {

  test("should return 401 when token is missing", async () => {

    const response = await request(app)
      .patch("/users/1/role")
      .send({
        role: "Pharmacist"
      });

    expect(response.status).toBe(401);
  });


  test("should return 403 when user is not Admin", async () => {

    const response = await request(app)
      .patch("/users/1/role")
      .set("Authorization", `Bearer ${pharmacistToken}`)
      .send({
        role: "Customer"
      });

    expect(response.status).toBe(403);

    expect(userService.changeRole).not.toHaveBeenCalled();
  });


  test("should change role successfully", async () => {

    userService.changeRole.mockResolvedValue({
      status: 200,
      success: true,
      message: "User role updated successfully."
    });

    const response = await request(app)
      .patch("/users/1/role")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        role: "Pharmacist"
      });

    expect(response.status).toBe(200);

    expect(response.body.success).toBe(true);

    expect(userService.changeRole).toHaveBeenCalledWith(
      1,
      "Pharmacist"
    );
  });

});

// ============================================================
// DEACTIVATE USER
// ============================================================

describe("PATCH /users/:userId/deactivate", () => {

  test("should return 401 when token is missing", async () => {

    const response = await request(app)
      .patch("/users/1/deactivate");

    expect(response.status).toBe(401);
  });


  test("should return 403 when user is not Admin", async () => {

    const response = await request(app)
      .patch("/users/1/deactivate")
      .set("Authorization", `Bearer ${customerToken}`);

    expect(response.status).toBe(403);

    expect(userService.deactivateUser).not.toHaveBeenCalled();
  });


  test("should deactivate user successfully", async () => {

    userService.deactivateUser.mockResolvedValue({
      status: 200,
      success: true,
      message: "User deactivated successfully."
    });

    const response = await request(app)
      .patch("/users/1/deactivate")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(response.status).toBe(200);

    expect(response.body.success).toBe(true);

    expect(userService.deactivateUser).toHaveBeenCalledWith(1,1);
  });

});

// ============================================================
// RESTORE USER
// ============================================================

describe("PATCH /users/:userId/restore", () => {

  test("should return 401 when token is missing", async () => {

    const response = await request(app)
      .patch("/users/1/restore");

    expect(response.status).toBe(401);
  });


  test("should return 403 when user is not Admin", async () => {

    const response = await request(app)
      .patch("/users/1/restore")
      .set("Authorization", `Bearer ${customerToken}`);

    expect(response.status).toBe(403);

    expect(userService.restoreUser).not.toHaveBeenCalled();
  });


  test("should restore user successfully", async () => {

    userService.restoreUser.mockResolvedValue({
      status: 200,
      success: true,
      message: "User restored successfully."
    });

    const response = await request(app)
      .patch("/users/1/restore")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(response.status).toBe(200);

    expect(response.body.success).toBe(true);

    expect(userService.restoreUser).toHaveBeenCalledWith(1);
  });

});
