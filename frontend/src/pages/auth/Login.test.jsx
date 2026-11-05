
import {
  describe,
  test,
  expect,
  vi,
  beforeEach,
} from "vitest";

import {
  render,
  screen,
  waitFor,
  act,
} from "@testing-library/react";

import userEvent from "@testing-library/user-event";

import Login from "./Login";
import { loginUser } from "../../services/auth.service";
import useAuth from "../../hooks/useAuth";

// =============================================
// MOCK DEPENDENCIES
// =============================================

vi.mock("../../services/auth.service", () => ({
  loginUser: vi.fn(),
}));

vi.mock("../../hooks/useAuth", () => ({
  default: vi.fn(),
}));

// =============================================
// TEST HELPERS
// =============================================

const mockLogin = vi.fn();

const session = {
  token: "fake-jwt-token",
  role: "Admin",
};

const fillCredentials = async (
  user,
  email = "admin@gmail.com",
  password = "password123"
) => {
  await user.type(
    screen.getByLabelText("Email address"),
    email
  );

  await user.type(
    screen.getByLabelText("Password"),
    password
  );
};

// =============================================
// LOGIN COMPONENT TESTS
// =============================================

describe("Login Component", () => {

  beforeEach(() => {
    vi.resetAllMocks();

    useAuth.mockReturnValue({
      login: mockLogin,
    });
  });

  // ===========================================
  // 1. RENDERING
  // ===========================================

  test("should render login form", () => {

    // Arrange
    render(<Login />);

    // Assert
    expect(
      screen.getByRole("heading", {
        name: "Sign in to your account",
      })
    ).toBeInTheDocument();

    expect(
      screen.getByLabelText("Email address")
    ).toBeInTheDocument();

    expect(
      screen.getByLabelText("Password")
    ).toBeInTheDocument();

    expect(
      screen.getByRole("button", {
        name: "Sign In",
      })
    ).toBeInTheDocument();
  });

  // ===========================================
  // 2. USER INPUT
  // ===========================================

  test("should allow entering email and password", async () => {

    // Arrange
    const user = userEvent.setup();

    render(<Login />);

    // Act
    await fillCredentials(user);

    // Assert
    expect(
      screen.getByLabelText("Email address")
    ).toHaveValue("admin@gmail.com");

    expect(
      screen.getByLabelText("Password")
    ).toHaveValue("password123");
  });

  // ===========================================
  // 3. EMPTY FIELDS
  // ===========================================

  test("should reject empty email and password", async () => {

    // Arrange
    const user = userEvent.setup();

    render(<Login />);

    // Act
    await user.click(
      screen.getByRole("button", {
        name: "Sign In",
      })
    );

    // Assert
    expect(
      screen.getByText("Enter your email address.")
    ).toBeInTheDocument();

    expect(
      screen.getByText("Enter your password.")
    ).toBeInTheDocument();

    expect(
      screen.getByLabelText("Email address")
    ).toHaveFocus();

    expect(loginUser).not.toHaveBeenCalled();
  });

  // ===========================================
  // 4. INVALID EMAIL
  // ===========================================

  test("should reject invalid email format", async () => {

    // Arrange
    const user = userEvent.setup();

    render(<Login />);

    // Act
    await fillCredentials(
      user,
      "invalid-email",
      "password123"
    );

    await user.click(
      screen.getByRole("button", {
        name: "Sign In",
      })
    );

    // Assert
    expect(
      screen.getByText("Enter a valid email address.")
    ).toBeInTheDocument();

    expect(loginUser).not.toHaveBeenCalled();
  });

  // ===========================================
  // 5. MISSING PASSWORD
  // ===========================================

  test("should reject missing password", async () => {

    // Arrange
    const user = userEvent.setup();

    render(<Login />);

    // Act
    await user.type(
      screen.getByLabelText("Email address"),
      "admin@gmail.com"
    );

    await user.click(
      screen.getByRole("button", {
        name: "Sign In",
      })
    );

    // Assert
    expect(
      screen.getByText("Enter your password.")
    ).toBeInTheDocument();

    expect(loginUser).not.toHaveBeenCalled();
  });

  // ===========================================
  // 6. EMAIL LENGTH LIMIT
  // ===========================================

  test("should configure email maximum length", () => {

    // Arrange
    render(<Login />);

    // Assert
    expect(
      screen.getByLabelText("Email address")
    ).toHaveAttribute("maxlength", "100");
  });

  // ===========================================
  // 7. SHOW / HIDE PASSWORD
  // ===========================================

  test("should toggle password visibility", async () => {

    // Arrange
    const user = userEvent.setup();

    render(<Login />);

    const passwordInput =
      screen.getByLabelText("Password");

    // Assert initial state
    expect(passwordInput).toHaveAttribute(
      "type",
      "password"
    );

    // Act: Show password
    await user.click(
      screen.getByRole("button", {
        name: "Show password",
      })
    );

    // Assert
    expect(passwordInput).toHaveAttribute(
      "type",
      "text"
    );

    // Act: Hide password
    await user.click(
      screen.getByRole("button", {
        name: "Hide password",
      })
    );

    // Assert
    expect(passwordInput).toHaveAttribute(
      "type",
      "password"
    );
  });

  // ===========================================
  // 8. SUCCESSFUL LOGIN
  // ===========================================

  test("should login with valid credentials", async () => {

    // Arrange
    const user = userEvent.setup();

    loginUser.mockResolvedValue(session);

    render(<Login />);

    // Act
    await fillCredentials(user);

    await user.click(
      screen.getByRole("button", {
        name: "Sign In",
      })
    );

    // Assert
    await waitFor(() => {
      expect(loginUser).toHaveBeenCalledWith({
        email: "admin@gmail.com",
        password: "password123",
      });
    });

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith(
        session
      );
    });

    expect(loginUser).toHaveBeenCalledTimes(1);
  });

  // ===========================================
  // 9. CLEAR PASSWORD AFTER LOGIN
  // ===========================================

  test("should clear password after successful login", async () => {

    // Arrange
    const user = userEvent.setup();

    loginUser.mockResolvedValue(session);

    render(<Login />);

    // Act
    await fillCredentials(user);

    await user.click(
      screen.getByRole("button", {
        name: "Show password",
      })
    );

    await user.click(
      screen.getByRole("button", {
        name: "Sign In",
      })
    );

    // Assert
    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalled();
    });

    expect(
      screen.getByLabelText("Password")
    ).toHaveValue("");

    expect(
      screen.getByLabelText("Password")
    ).toHaveAttribute("type", "password");

    expect(
      screen.getByLabelText("Email address")
    ).toHaveValue("admin@gmail.com");
  });

  // ===========================================
  // 10. API LOGIN FAILURE
  // ===========================================

  test("should display API error when login fails", async () => {

    // Arrange
    const user = userEvent.setup();

    loginUser.mockRejectedValue(
      new Error("Incorrect password.")
    );

    render(<Login />);

    // Act
    await fillCredentials(
      user,
      "admin@gmail.com",
      "wrongpassword"
    );

    await user.click(
      screen.getByRole("button", {
        name: "Sign In",
      })
    );

    // Assert
    expect(
      await screen.findByRole("alert")
    ).toHaveTextContent("Incorrect password.");

    expect(mockLogin).not.toHaveBeenCalled();
  });

  // ===========================================
  // 11. DEFAULT API ERROR
  // ===========================================

  test("should display fallback error message", async () => {

    // Arrange
    const user = userEvent.setup();

    loginUser.mockRejectedValue(
      new Error("")
    );

    render(<Login />);

    // Act
    await fillCredentials(user);

    await user.click(
      screen.getByRole("button", {
        name: "Sign In",
      })
    );

    // Assert
    expect(
      await screen.findByRole("alert")
    ).toHaveTextContent(
      "Unable to sign in. Please try again."
    );
  });

  // ===========================================
  // 12. CLEAR ERROR WHEN USER TYPES
  // ===========================================

  test("should clear API error when input changes", async () => {

    // Arrange
    const user = userEvent.setup();

    loginUser.mockRejectedValue(
      new Error("Incorrect password.")
    );

    render(<Login />);

    await fillCredentials(user);

    await user.click(
      screen.getByRole("button", {
        name: "Sign In",
      })
    );

    expect(
      await screen.findByRole("alert")
    ).toHaveTextContent("Incorrect password.");

    // Act
    await user.type(
      screen.getByLabelText("Password"),
      "1"
    );

    // Assert
    expect(
      screen.queryByRole("alert")
    ).not.toBeInTheDocument();
  });

  // ===========================================
  // 13. LOADING STATE
  // ===========================================

  test("should show loading state during login", async () => {

    // Arrange
    const user = userEvent.setup();

    let resolveLogin;

    loginUser.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveLogin = resolve;
        })
    );

    render(<Login />);

    await fillCredentials(user);

    // Act
    await user.click(
      screen.getByRole("button", {
        name: "Sign In",
      })
    );

    // Assert loading state
    expect(
      screen.getByRole("button", {
        name: "Signing in...",
      })
    ).toBeDisabled();

    expect(
      screen.getByRole("status")
    ).toHaveTextContent(
      "Checking your credentials..."
    );

    expect(
      screen.getByLabelText("Email address")
    ).toBeDisabled();

    expect(
      screen.getByLabelText("Password")
    ).toBeDisabled();

    // Finish login
    await act(async () => {
      resolveLogin(session);
    });

    // Assert loading finished
    expect(mockLogin).toHaveBeenCalledWith(
      session
    );

    expect(
      screen.getByRole("button", {
        name: "Sign In",
      })
    ).toBeEnabled();
  });

  // ===========================================
  // 14. PREVENT DUPLICATE SUBMISSION
  // ===========================================

  test("should prevent duplicate login requests", async () => {

    // Arrange
    const user = userEvent.setup();

    let resolveLogin;

    loginUser.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveLogin = resolve;
        })
    );

    render(<Login />);

    await fillCredentials(user);

    // Act
    await user.click(
      screen.getByRole("button", {
        name: "Sign In",
      })
    );

    // Attempt another click while loading
    await user.click(
      screen.getByRole("button", {
        name: "Signing in...",
      })
    );

    // Assert
    expect(loginUser).toHaveBeenCalledTimes(1);

    // Finish pending request
    await act(async () => {
      resolveLogin(session);
    });

    expect(mockLogin).toHaveBeenCalledTimes(1);
  });

  // ===========================================
  // 15. RETRY AFTER FAILED LOGIN
  // ===========================================

  test("should allow retry after login failure", async () => {

    // Arrange
    const user = userEvent.setup();

    loginUser
      .mockRejectedValueOnce(
        new Error("Incorrect password.")
      )
      .mockResolvedValueOnce(session);

    render(<Login />);

    await fillCredentials(
      user,
      "admin@gmail.com",
      "wrongpassword"
    );

    // Act: First attempt
    await user.click(
      screen.getByRole("button", {
        name: "Sign In",
      })
    );

    expect(
      await screen.findByRole("alert")
    ).toHaveTextContent("Incorrect password.");

    // Act: Correct password
    await user.clear(
      screen.getByLabelText("Password")
    );

    await user.type(
      screen.getByLabelText("Password"),
      "correctpassword"
    );

    await user.click(
      screen.getByRole("button", {
        name: "Sign In",
      })
    );

    // Assert
    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith(
        session
      );
    });

    expect(loginUser).toHaveBeenCalledTimes(2);

    expect(loginUser).toHaveBeenLastCalledWith({
      email: "admin@gmail.com",
      password: "correctpassword",
    });
  });
});
