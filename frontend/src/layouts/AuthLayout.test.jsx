
import {
  describe,
  test,
  expect,
} from "vitest";

import {
  render,
  screen,
  within,
} from "@testing-library/react";

import AuthLayout from "./AuthLayout";

function renderLayout(children = <h1>Login form</h1>) {
  return render(
    <AuthLayout>{children}</AuthLayout>
  );
}

describe("AuthLayout", () => {
  test("renders the provided child content", () => {
    renderLayout();

    expect(
      screen.getByRole("heading", {
        name: "Login form",
      })
    ).toBeInTheDocument();
  });

  test("renders children inside the main landmark", () => {
    renderLayout(
      <form aria-label="Sign in">
        <label htmlFor="email">Email</label>
        <input id="email" type="email" />
        <button type="submit">Sign in</button>
      </form>
    );

    const main = screen.getByRole("main");

    expect(
      within(main).getByRole("form", {
        name: "Sign in",
      })
    ).toBeInTheDocument();

    expect(
      within(main).getByRole("textbox", {
        name: "Email",
      })
    ).toBeInTheDocument();

    expect(
      within(main).getByRole("button", {
        name: "Sign in",
      })
    ).toBeInTheDocument();
  });

  test("displays Smart Pharmacy branding in desktop and mobile sections", () => {
    renderLayout();

    expect(
      screen.getAllByText("Smart Pharmacy")
    ).toHaveLength(2);
  });

  test("displays the pharmacy management heading", () => {
    renderLayout();

    const aside = screen.getByRole("complementary");

    expect(
      within(aside).getByText(
        "Pharmacy management"
      )
    ).toBeInTheDocument();

    expect(
      within(aside).getByRole("heading", {
        level: 2,
      })
    ).toHaveTextContent(
      /Your pharmacy\.\s*One organized workspace\./
    );
  });

  test("displays the platform description", () => {
    renderLayout();

    expect(
      screen.getByText(
        "Manage medicines, monitor inventory, and handle daily sales from one place."
      )
    ).toBeInTheDocument();
  });

  test("renders all three pharmacy features", () => {
    renderLayout();

    const aside = screen.getByRole("complementary");

    const items = within(aside).getAllByRole(
      "listitem"
    );

    expect(items).toHaveLength(3);

    expect(items[0]).toHaveTextContent(
      "Medicine and inventory management"
    );

    expect(items[1]).toHaveTextContent(
      "Batch and expiry tracking"
    );

    expect(items[2]).toHaveTextContent(
      "Billing and pharmacy sales"
    );
  });

  test("renders decorative pharmacy marks as aria-hidden", () => {
    const { container } = renderLayout();

    const marks = Array.from(
      container.querySelectorAll(
        'span[aria-hidden="true"]'
      )
    ).filter(
      (element) => element.textContent.trim() === "+"
    );

    expect(marks).toHaveLength(2);
  });

  test("displays the current year in the footer", () => {
    renderLayout();

    const footer = screen
      .getByRole("main")
      .querySelector("footer");

    expect(footer).toBeInTheDocument();

    expect(footer).toHaveTextContent(
      `© ${new Date().getFullYear()} Smart Pharmacy Management System`
    );
  });

  test("renders nested React components without changing their content", () => {
    function LoginContent() {
      return (
        <div data-testid="login-content">
          <h2>Welcome back</h2>
          <p>Enter your credentials.</p>
        </div>
      );
    }

    renderLayout(<LoginContent />);

    expect(
      screen.getByTestId("login-content")
    ).toBeInTheDocument();

    expect(
      screen.getByRole("heading", {
        name: "Welcome back",
      })
    ).toBeInTheDocument();

    expect(
      screen.getByText(
        "Enter your credentials."
      )
    ).toBeInTheDocument();
  });
});
