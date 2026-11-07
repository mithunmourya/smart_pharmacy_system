
import { test, expect } from "@playwright/test";

// MODULE 10 — MY PROFILE AND CHANGE PASSWORD
// Real password changes use disposable accounts only.

const API = (
  process.env.E2E_API_BASE_URL ||
  "http://127.0.0.1:5000"
).replace(/\/+$/, "");

const CHANGE = "/users/change-password";

const ORIGINAL = {
  Admin: {
    email: process.env.E2E_ADMIN_EMAIL,
    password: process.env.E2E_ADMIN_PASSWORD,
  },
  Pharmacist: {
    email: process.env.E2E_PHARMACIST_EMAIL,
    password: process.env.E2E_PHARMACIST_PASSWORD,
  },
  Customer: {
    email: process.env.E2E_CUSTOMER_EMAIL,
    password: process.env.E2E_CUSTOMER_PASSWORD,
  },
};

const INITIAL_PASSWORD = "E2eProfile!2026";
const NEW_PASSWORD = "NewE2eProfile!2026";
const THIRD_PASSWORD = "ThirdE2eProfile!2026";

let sequence = 0;

const apiMatch = (
  response,
  path,
  method = "GET"
) =>
  new URL(response.url()).pathname === path &&
  response.request().method() === method;

const button = (scope, name) =>
  scope.getByRole("button", {
    name,
    exact: true,
  });

const form = (page) =>
  page.locator("form").filter({
    has: page.getByLabel("Current password"),
  });

const current = (page) =>
  page.getByLabel("Current password", {
    exact: true,
  });

const next = (page) =>
  page.getByLabel("New password", {
    exact: true,
  });

const confirm = (page) =>
  page.getByLabel("Confirm new password", {
    exact: true,
  });

const submit = (page) =>
  button(form(page), "Update Password");

const notice = (page) =>
  form(page).getByRole("status");

const error = (page) =>
  form(page).getByRole("alert");

// ============================================
// TEST ACCOUNT HELPERS
// ============================================

function accountId() {
  return `${process.pid}-${Date.now().toString(36)}-${++sequence}`;
}

async function seedUser(
  request,
  role = "Customer"
) {
  const id = accountId();

  const account = {
    name: `E2E Profile ${id}`,
    email: `e2e-profile-${id}@example.invalid`,
    password: INITIAL_PASSWORD,
    role,
  };

  const response = await request.post(
    `${API}/users/register`,
    {
      data: account,
    }
  );

  expect(
    [200, 201],
    await response.text()
  ).toContain(response.status());

  return account;
}

// ============================================
// LOGIN HELPERS
// ============================================

async function loginAs(page, account, role) {
  expect(
    account.email && account.password,
    `${role} credentials missing`
  ).toBeTruthy();

  await page.goto("/login");

  await page
    .getByLabel("Email address")
    .fill(account.email);

  await page
    .getByLabel("Password", {
      exact: true,
    })
    .fill(account.password);

  const [response] = await Promise.all([
    page.waitForResponse((r) =>
      apiMatch(
        r,
        "/users/login",
        "POST"
      )
    ),

    button(page, "Sign In").click(),
  ]);

  expect(
    response.status(),
    await response.text()
  ).toBe(200);

  const signedIn = (
    await response.json()
  ).data.user;

  expect(signedIn.role).toBe(role);

  await expect(page).toHaveURL(
    /\/dashboard$/
  );

  return signedIn;
}

// ============================================
// PROFILE NAVIGATION HELPERS
// ============================================

async function openProfile(
  page,
  role = "Customer",
  account = ORIGINAL[role],
  via = "sidebar"
) {
  const user = await loginAs(
    page,
    account,
    role
  );

  if (via === "navbar") {
    await page.getByRole("link", {
      name: `Open my profile: ${user.name}`,
      exact: true,
    }).click();
  } else {
    await page
      .getByRole("complementary", {
        name: "Sidebar",
      })
      .getByRole("navigation", {
        name: "Account navigation",
      })
      .getByRole("link", {
        name: "My Profile",
        exact: true,
      })
      .click();
  }

  await expect(page).toHaveURL(
    /\/profile$/
  );

  await expect(
    page.getByRole("heading", {
      name: "My Profile",
      level: 1,
    })
  ).toBeVisible();

  return user;
}

async function openPassword(
  page,
  role = "Customer",
  account = ORIGINAL[role]
) {
  const user = await openProfile(
    page,
    role,
    account
  );

  await page.getByRole("link", {
    name: "Change Password",
    exact: true,
  }).click();

  await expect(page).toHaveURL(
    /\/settings\/change-password$/
  );

  await expect(
    page.getByRole("heading", {
      name: "Change Password",
      level: 1,
    })
  ).toBeVisible();

  return user;
}

// ============================================
// PASSWORD FORM HELPERS
// ============================================

async function fillPasswords(
  page,
  {
    old = INITIAL_PASSWORD,
    fresh = NEW_PASSWORD,
    again = NEW_PASSWORD,
  } = {}
) {
  await current(page).fill(old);
  await next(page).fill(fresh);
  await confirm(page).fill(again);
}

async function mockChange(
  page,
  status,
  message,
  data = null
) {
  await page.route(
    `${API}${CHANGE}`,
    async (route) => {
      if (
        route.request().method() !== "PATCH"
      ) {
        return route.continue();
      }

      await route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify({
          success:
            status >= 200 && status < 300,
          message,
          data,
        }),
      });
    }
  );
}

async function submitWithResponse(page) {
  const [response] = await Promise.all([
    page.waitForResponse((r) =>
      apiMatch(r, CHANGE, "PATCH")
    ),

    submit(page).click(),
  ]);

  return response;
}

async function attemptLogin(
  request,
  email,
  password
) {
  return request.post(
    `${API}/users/login`,
    {
      data: {
        email,
        password,
      },
    }
  );
}

// ============================================
// SECTION 1 — PROFILE DETAILS AND NAVIGATION
// TESTS 01–20
// ============================================

test.describe(
  "My Profile — All Roles and Navigation",
  () => {

    // TESTS 01–03

    for (const [number, role] of [
      [1, "Admin"],
      [2, "Pharmacist"],
      [3, "Customer"],
    ]) {
      test(`${number} ${role} sees correct profile information`, async ({
        page,
      }) => {
        const user = await openProfile(
          page,
          role
        );

        const details = page.locator(
          'section[aria-labelledby="profile-details-heading"]'
        );

        await expect(
          details.getByRole("heading", {
            name: user.name,
            level: 2,
          })
        ).toBeVisible();

        await expect(
          details.locator("dl")
        ).toContainText(user.name);

        await expect(
          details.locator("dl")
        ).toContainText(user.email);

        await expect(
          details.locator("dl")
        ).toContainText(role);

        await expect(
          page
            .getByText(`${role} workspace`)
            .first()
        ).toBeVisible();
      });
    }

    // TESTS 04–06

    for (const [number, role] of [
      [4, "Admin"],
      [5, "Pharmacist"],
      [6, "Customer"],
    ]) {
      test(`${number} ${role} can open Profile through navbar`, async ({
        page,
      }) => {
        const user = await openProfile(
          page,
          role,
          ORIGINAL[role],
          "navbar"
        );

        await expect(
          page.getByRole("heading", {
            name: user.name,
            level: 2,
          })
        ).toBeVisible();
      });
    }

    // TESTS 07–09

    for (const [number, role] of [
      [7, "Admin"],
      [8, "Pharmacist"],
      [9, "Customer"],
    ]) {
      test(`${number} ${role} can open Change Password`, async ({
        page,
      }) => {
        await openPassword(page, role);

        await expect(
          current(page)
        ).toBeVisible();

        await expect(
          next(page)
        ).toBeVisible();

        await expect(
          confirm(page)
        ).toBeVisible();
      });
    }

    test("10 Admin sees Users-management guidance", async ({
      page,
    }) => {
      await openProfile(page, "Admin");

      await expect(
        page.getByText(
          "Name and email changes are managed through Users management."
        )
      ).toBeVisible();
    });

    // TESTS 11–12

    for (const [number, role] of [
      [11, "Pharmacist"],
      [12, "Customer"],
    ]) {
      test(`${number} ${role} sees administrator guidance`, async ({
        page,
      }) => {
        await openProfile(page, role);

        await expect(
          page.getByText(
            /To update your name or email address, please contact your administrator/
          )
        ).toBeVisible();
      });
    }

    test("13 Profile has no editable name or email fields", async ({
      page,
    }) => {
      await openProfile(page);

      await expect(
        page.getByRole("textbox")
      ).toHaveCount(0);

      await expect(
        page.getByRole("button", {
          name: /save profile|update profile/i,
        })
      ).toHaveCount(0);
    });

    test("14 Profile displays correct information labels", async ({
      page,
    }) => {
      await openProfile(page);

      const list = page.locator(
        'section[aria-labelledby="profile-details-heading"] dl'
      );

      for (const label of [
        "Full name",
        "Email address",
        "Account role",
      ]) {
        await expect(
          list.locator("dt", {
            hasText: label,
          })
        ).toHaveCount(1);
      }
    });

    test("15 Navbar and sidebar link to the same profile", async ({
      page,
    }) => {
      const user = await openProfile(page);

      await expect(
        page.getByRole("link", {
          name: `Open my profile: ${user.name}`,
        })
      ).toHaveAttribute(
        "href",
        "/profile"
      );

      await expect(
        page
          .getByRole("navigation", {
            name: "Account navigation",
          })
          .getByRole("link", {
            name: "My Profile",
          })
      ).toHaveAttribute(
        "href",
        "/profile"
      );
    });

    test("16 Profile is marked active in account navigation", async ({
      page,
    }) => {
      await openProfile(page);

      await expect(
        page
          .getByRole("complementary", {
            name: "Sidebar",
          })
          .getByRole("link", {
            name: "My Profile",
          })
      ).toHaveAttribute(
        "aria-current",
        "page"
      );
    });

    test("17 Profile avatar displays user initials", async ({
      page,
      request,
    }) => {
      const account = await seedUser(
        request
      );

      await openProfile(
        page,
        "Customer",
        account
      );

      await expect(
        page
          .locator(
            'section[aria-labelledby="profile-details-heading"] span[aria-hidden="true"]'
          )
          .first()
      ).toHaveText("EP");
    });

    test("18 Back to My Profile works without logging in again", async ({
      page,
    }) => {
      await openPassword(page);

      await page.getByRole("link", {
        name: "Back to My Profile",
      }).click();

      await expect(page).toHaveURL(
        /\/profile$/
      );

      await expect(
        page.getByRole("heading", {
          name: "My Profile",
          level: 1,
        })
      ).toBeVisible();
    });

    test("19 Mobile navigation opens My Profile", async ({
      page,
    }) => {
      await page.setViewportSize({
        width: 390,
        height: 844,
      });

      await loginAs(
        page,
        ORIGINAL.Customer,
        "Customer"
      );

      await button(
        page,
        "Open navigation menu"
      ).click();

      const drawer = page.getByRole(
        "dialog",
        {
          name: "Navigation",
        }
      );

      await expect(
        drawer
      ).toBeVisible();

      await drawer.getByRole("link", {
        name: "My Profile",
        exact: true,
      }).click();

      await expect(page).toHaveURL(
        /\/profile$/
      );

      await expect(
        drawer
      ).not.toBeVisible();
    });

    test("20 Signing out from Profile returns to login", async ({
      page,
    }) => {
      await openProfile(page);

      await button(
        page,
        "Sign Out"
      ).click();

      await expect(page).toHaveURL(
        /\/login$/
      );

      await expect(
        page.getByRole("heading", {
          name: "Sign in to your account",
        })
      ).toBeVisible();
    });
  }
);

// ============================================
// SECTION 2 — FORM VALIDATION
// TESTS 21–38
// ============================================

test.describe(
  "Change Password — Form Validation",
  () => {

    test("21 Shows all password fields and submit button", async ({
      page,
    }) => {
      await openPassword(page);

      for (const field of [
        current(page),
        next(page),
        confirm(page),
      ]) {
        await expect(
          field
        ).toBeVisible();
      }

      await expect(
        submit(page)
      ).toBeEnabled();
    });

    test("22 All password fields are masked initially", async ({
      page,
    }) => {
      await openPassword(page);

      for (const field of [
        current(page),
        next(page),
        confirm(page),
      ]) {
        await expect(field).toHaveAttribute(
          "type",
          "password"
        );
      }
    });

    test("23 Show passwords reveals all fields", async ({
      page,
    }) => {
      await openPassword(page);

      await page.getByRole("checkbox", {
        name: "Show passwords",
      }).check();

      for (const field of [
        current(page),
        next(page),
        confirm(page),
      ]) {
        await expect(field).toHaveAttribute(
          "type",
          "text"
        );
      }
    });

    test("24 Unchecking Show passwords hides them again", async ({
      page,
    }) => {
      await openPassword(page);

      const toggle = page.getByRole(
        "checkbox",
        {
          name: "Show passwords",
        }
      );

      await toggle.check();
      await toggle.uncheck();

      for (const field of [
        current(page),
        next(page),
        confirm(page),
      ]) {
        await expect(field).toHaveAttribute(
          "type",
          "password"
        );
      }
    });

    test("25 Toggling visibility preserves typed values", async ({
      page,
    }) => {
      await openPassword(page);

      await fillPasswords(page);

      const toggle = page.getByRole(
        "checkbox",
        {
          name: "Show passwords",
        }
      );

      await toggle.check();
      await toggle.uncheck();

      await expect(
        current(page)
      ).toHaveValue(INITIAL_PASSWORD);

      await expect(
        next(page)
      ).toHaveValue(NEW_PASSWORD);

      await expect(
        confirm(page)
      ).toHaveValue(NEW_PASSWORD);
    });

    test("26 All password fields are required", async ({
      page,
    }) => {
      await openPassword(page);

      for (const field of [
        current(page),
        next(page),
        confirm(page),
      ]) {
        await expect(field).toHaveAttribute(
          "required",
          ""
        );
      }
    });

    test("27 Password fields use correct autocomplete", async ({
      page,
    }) => {
      await openPassword(page);

      await expect(
        current(page)
      ).toHaveAttribute(
        "autocomplete",
        "current-password"
      );

      await expect(
        next(page)
      ).toHaveAttribute(
        "autocomplete",
        "new-password"
      );

      await expect(
        confirm(page)
      ).toHaveAttribute(
        "autocomplete",
        "new-password"
      );
    });

    test("28 Form starts idle with no success or error", async ({
      page,
    }) => {
      await openPassword(page);

      await expect(
        form(page)
      ).toHaveAttribute(
        "aria-busy",
        "false"
      );

      await expect(
        notice(page)
      ).toBeEmpty();

      await expect(
        error(page)
      ).toHaveCount(0);
    });

    test("29 Empty form cannot submit to the backend", async ({
      page,
    }) => {
      await openPassword(page);

      let calls = 0;

      page.on("request", (req) => {
        if (
          req.method() === "PATCH" &&
          new URL(req.url()).pathname === CHANGE
        ) {
          calls++;
        }
      });

      await submit(page).click();

      await expect(
        current(page)
      ).toBeFocused();

      expect(
        await current(page).evaluate(
          (input) => input.checkValidity()
        )
      ).toBe(false);

      expect(calls).toBe(0);
    });

    // TESTS 30–32

    for (const [number, missing] of [
      [30, "current"],
      [31, "new"],
      [32, "confirmation"],
    ]) {
      test(`${number} Missing ${missing} password prevents submission`, async ({
        page,
      }) => {
        await openPassword(page);

        await fillPasswords(page, {
          old:
            missing === "current"
              ? ""
              : INITIAL_PASSWORD,

          fresh:
            missing === "new"
              ? ""
              : NEW_PASSWORD,

          again:
            missing === "confirmation"
              ? ""
              : NEW_PASSWORD,
        });

        let calls = 0;

        page.on("request", (req) => {
          if (
            req.method() === "PATCH" &&
            new URL(req.url()).pathname === CHANGE
          ) {
            calls++;
          }
        });

        await submit(page).click();

        const field =
          missing === "current"
            ? current(page)
            : missing === "new"
              ? next(page)
              : confirm(page);

        await expect(
          field
        ).toBeFocused();

        expect(
          await field.evaluate(
            (input) => input.checkValidity()
          )
        ).toBe(false);

        expect(calls).toBe(0);
      });
    }

    test("33 Password confirmation mismatch shows error", async ({
      page,
    }) => {
      await openPassword(page);

      await fillPasswords(page, {
        again: "AnotherPassword!2026",
      });

      await submit(page).click();

      await expect(
        error(page)
      ).toHaveText(
        "New password and confirmation do not match."
      );
    });

    test("34 New password cannot equal current password", async ({
      page,
    }) => {
      await openPassword(page);

      await fillPasswords(page, {
        fresh: INITIAL_PASSWORD,
        again: INITIAL_PASSWORD,
      });

      await submit(page).click();

      await expect(
        error(page)
      ).toHaveText(
        "New password must differ from your current password."
      );
    });

    test("35 Password mismatch does not call the backend", async ({
      page,
    }) => {
      await openPassword(page);

      let calls = 0;

      page.on("request", (req) => {
        if (
          req.method() === "PATCH" &&
          new URL(req.url()).pathname === CHANGE
        ) {
          calls++;
        }
      });

      await fillPasswords(page, {
        again: "WrongConfirmation!",
      });

      await submit(page).click();

      await expect(
        error(page)
      ).toContainText("do not match");

      expect(calls).toBe(0);
    });

    test("36 Editing confirmation clears mismatch error", async ({
      page,
    }) => {
      await openPassword(page);

      await fillPasswords(page, {
        again: "WrongConfirmation!",
      });

      await submit(page).click();

      await expect(
        error(page)
      ).toBeVisible();

      await confirm(page).fill(
        NEW_PASSWORD
      );

      await expect(
        error(page)
      ).toHaveCount(0);
    });

    test("37 Editing current password clears old-password error", async ({
      page,
    }) => {
      await openPassword(page);

      await fillPasswords(page, {
        fresh: INITIAL_PASSWORD,
        again: INITIAL_PASSWORD,
      });

      await submit(page).click();

      await expect(
        error(page)
      ).toBeVisible();

      await current(page).fill(
        "AnotherCurrent!2026"
      );

      await expect(
        error(page)
      ).toHaveCount(0);
    });

    test("38 Pressing Enter enforces confirmation validation", async ({
      page,
    }) => {
      await openPassword(page);

      await fillPasswords(page, {
        again: "OtherConfirmation!2026",
      });

      await confirm(page).press(
        "Enter"
      );

      await expect(
        error(page)
      ).toHaveText(
        "New password and confirmation do not match."
      );
    });
  }
);

// ============================================
// SECTION 3 — API RESPONSE HANDLING
// TESTS 39–52
// ============================================

test.describe(
  "Change Password — API Responses and Recovery",
  () => {

    test("39 Success displays notice and clears all fields", async ({
      page,
    }) => {
      await openPassword(page);

      await mockChange(
        page,
        200,
        "E2E password updated successfully."
      );

      await fillPasswords(page);

      const response =
        await submitWithResponse(page);

      expect(
        response.status()
      ).toBe(200);

      await expect(
        notice(page)
      ).toHaveText(
        "E2E password updated successfully."
      );

      for (const field of [
        current(page),
        next(page),
        confirm(page),
      ]) {
        await expect(field).toHaveValue("");
      }
    });

    test("40 Success resets Show passwords to unchecked", async ({
      page,
    }) => {
      await openPassword(page);

      await mockChange(
        page,
        200,
        "Password changed successfully."
      );

      await page.getByRole("checkbox", {
        name: "Show passwords",
      }).check();

      await fillPasswords(page);

      await submitWithResponse(page);

      await expect(
        page.getByRole("checkbox", {
          name: "Show passwords",
        })
      ).not.toBeChecked();

      for (const field of [
        current(page),
        next(page),
        confirm(page),
      ]) {
        await expect(field).toHaveAttribute(
          "type",
          "password"
        );
      }
    });

    test("41 Editing field clears previous success notice", async ({
      page,
    }) => {
      await openPassword(page);

      await mockChange(
        page,
        200,
        "Password changed successfully."
      );

      await fillPasswords(page);

      await submitWithResponse(page);

      await expect(
        notice(page)
      ).toContainText(
        "Password changed"
      );

      await current(page).fill(
        "New input"
      );

      await expect(
        notice(page)
      ).toBeEmpty();
    });

    test("42 HTTP 400 shows server validation error", async ({
      page,
    }) => {
      await openPassword(page);

      await mockChange(
        page,
        400,
        "E2E password validation error"
      );

      await fillPasswords(page);

      const response =
        await submitWithResponse(page);

      expect(
        response.status()
      ).toBe(400);

      await expect(
        error(page)
      ).toHaveText(
        "E2E password validation error"
      );

      await expect(
        next(page)
      ).toHaveValue(NEW_PASSWORD);

      await expect(page).toHaveURL(
        /\/settings\/change-password$/
      );
    });

    test("43 HTTP 500 shows error without logging out", async ({
      page,
    }) => {
      await openPassword(page);

      await mockChange(
        page,
        500,
        "E2E temporary password failure"
      );

      await fillPasswords(page);

      const response =
        await submitWithResponse(page);

      expect(
        response.status()
      ).toBe(500);

      await expect(
        error(page)
      ).toHaveText(
        "E2E temporary password failure"
      );

      await expect(page).toHaveURL(
        /\/settings\/change-password$/
      );
    });

    test("44 Retrying after server failure succeeds", async ({
      page,
    }) => {
      await openPassword(page);

      await mockChange(
        page,
        500,
        "E2E temporary password failure"
      );

      await fillPasswords(page);

      await submitWithResponse(page);

      await expect(
        error(page)
      ).toBeVisible();

      await page.unroute(
        `${API}${CHANGE}`
      );

      await mockChange(
        page,
        200,
        "E2E retry succeeded"
      );

      const response =
        await submitWithResponse(page);

      expect(
        response.status()
      ).toBe(200);

      await expect(
        notice(page)
      ).toHaveText(
        "E2E retry succeeded"
      );

      await expect(
        error(page)
      ).toHaveCount(0);
    });

    test("45 Network failure displays connection error", async ({
      page,
    }) => {
      await openPassword(page);

      await page.route(
        `${API}${CHANGE}`,
        (route) => route.abort("failed")
      );

      await fillPasswords(page);

      await submit(page).click();

      await expect(
        error(page)
      ).toContainText(
        "Unable to connect to the server"
      );

      await expect(page).toHaveURL(
        /\/settings\/change-password$/
      );
    });

    test("46 Incorrect current password HTTP 401 preserves session", async ({
      page,
    }) => {
      await openPassword(page);

      await mockChange(
        page,
        401,
        "Current password is incorrect."
      );

      await fillPasswords(page, {
        old: "DefinitelyWrongCurrent!",
      });

      const response =
        await submitWithResponse(page);

      expect(
        response.status()
      ).toBe(401);

      await expect(
        error(page)
      ).toHaveText(
        "Current password is incorrect."
      );

      await expect(page).toHaveURL(
        /\/settings\/change-password$/
      );

      await expect(
        page.getByRole("link", {
          name: "Back to My Profile",
        })
      ).toBeVisible();
    });

    test("47 Expired session HTTP 401 logs out user", async ({
      page,
    }) => {
      await openPassword(page);

      await mockChange(
        page,
        401,
        "Invalid or expired token."
      );

      await fillPasswords(page);

      const response =
        await submitWithResponse(page);

      expect(
        response.status()
      ).toBe(401);

      await expect(page).toHaveURL(
        /\/login$/
      );

      await expect(
        page.getByRole("heading", {
          name: "Sign in to your account",
        })
      ).toBeVisible();
    });

    test("48 Form is disabled while password update is pending", async ({
      page,
    }) => {
      await openPassword(page);

      let release;

      await page.route(
        `${API}${CHANGE}`,
        async (route) => {
          await new Promise((resolve) => {
            release = resolve;
          });

          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              success: true,
              message: "Updated.",
            }),
          });
        }
      );

      await fillPasswords(page);

      await submit(page).click();

      await expect
        .poll(() => typeof release)
        .toBe("function");

      await expect(
        form(page)
      ).toHaveAttribute(
        "aria-busy",
        "true"
      );

      await expect(
        button(form(page), "Updating...")
      ).toBeDisabled();

      await expect(
        current(page)
      ).toBeDisabled();

      await expect(
        notice(page)
      ).toHaveText(
        "Updating your password..."
      );

      release();

      await expect(
        form(page)
      ).toHaveAttribute(
        "aria-busy",
        "false"
      );

      await expect(
        submit(page)
      ).toBeEnabled();
    });

    // TESTS 49–51

    for (const [number, role] of [
      [49, "Admin"],
      [50, "Pharmacist"],
      [51, "Customer"],
    ]) {
      test(`${number} ${role} submits correct password change request`, async ({
        page,
      }) => {
        await openPassword(page, role);

        let sent;

        await page.route(
          `${API}${CHANGE}`,
          async (route) => {
            sent =
              route.request().postDataJSON();

            await route.fulfill({
              status: 200,
              contentType: "application/json",
              body: JSON.stringify({
                success: true,
                message: "E2E accepted.",
              }),
            });
          }
        );

        await fillPasswords(page);

        await submitWithResponse(page);

        expect(sent).toEqual({
          currentPassword: INITIAL_PASSWORD,
          newPassword: NEW_PASSWORD,
        });

        expect(
          sent
        ).not.toHaveProperty(
          "confirmPassword"
        );

        await expect(
          notice(page)
        ).toHaveText(
          "E2E accepted."
        );
      });
    }

    test("52 Successful response keeps account navigation working", async ({
      page,
    }) => {
      await openPassword(page);

      await mockChange(
        page,
        200,
        "Password changed successfully."
      );

      await fillPasswords(page);

      await submitWithResponse(page);

      await next(page).fill(
        "AnotherNewPassword"
      );

      await expect(
        notice(page)
      ).toBeEmpty();

      await page.getByRole("link", {
        name: "Back to My Profile",
      }).click();

      await expect(page).toHaveURL(
        /\/profile$/
      );
    });
  }
);

// ============================================
// SECTION 4 — REAL PASSWORD CHANGES & SECURITY
// TESTS 53–59
// ============================================

test.describe(
  "Change Password — Real Backend and Security",
  () => {

    test("53 Wrong current password is rejected without logging out", async ({
      page,
      request,
    }) => {
      const account =
        await seedUser(request);

      await openPassword(
        page,
        "Customer",
        account
      );

      await fillPasswords(page, {
        old: "WrongCurrent!2026",
      });

      const response =
        await submitWithResponse(page);

      expect(
        response.status()
      ).toBe(401);

      await expect(
        error(page)
      ).toHaveText(
        "Current password is incorrect."
      );

      await expect(page).toHaveURL(
        /\/settings\/change-password$/
      );

      const login =
        await attemptLogin(
          request,
          account.email,
          INITIAL_PASSWORD
        );

      expect(
        login.status()
      ).toBe(200);
    });

    test("54 Real password change updates backend login credentials", async ({
      page,
      request,
    }) => {
      const account =
        await seedUser(request);

      await openPassword(
        page,
        "Customer",
        account
      );

      await fillPasswords(page);

      const response =
        await submitWithResponse(page);

      expect(
        response.status(),
        await response.text()
      ).toBe(200);

      await expect(
        notice(page)
      ).toContainText(/password/i);

      await expect(
        current(page)
      ).toHaveValue("");

      await expect(
        next(page)
      ).toHaveValue("");

      await expect(
        confirm(page)
      ).toHaveValue("");

      await expect(page).toHaveURL(
        /\/settings\/change-password$/
      );

      const oldLogin =
        await attemptLogin(
          request,
          account.email,
          INITIAL_PASSWORD
        );

      expect(
        oldLogin.status()
      ).toBe(401);

      const newLogin =
        await attemptLogin(
          request,
          account.email,
          NEW_PASSWORD
        );

      expect(
        newLogin.status()
      ).toBe(200);
    });

    test("55 Customer can log out and log in with new password", async ({
      page,
      request,
    }) => {
      const account =
        await seedUser(request);

      await openPassword(
        page,
        "Customer",
        account
      );

      await fillPasswords(page);

      const changed =
        await submitWithResponse(page);

      expect(
        changed.status()
      ).toBe(200);

      await button(
        page,
        "Sign Out"
      ).click();

      await expect(page).toHaveURL(
        /\/login$/
      );

      await page
        .getByLabel("Email address")
        .fill(account.email);

      await page
        .getByLabel("Password", {
          exact: true,
        })
        .fill(NEW_PASSWORD);

      const [login] = await Promise.all([
        page.waitForResponse((r) =>
          apiMatch(
            r,
            "/users/login",
            "POST"
          )
        ),

        button(
          page,
          "Sign In"
        ).click(),
      ]);

      expect(
        login.status()
      ).toBe(200);

      await expect(page).toHaveURL(
        /\/dashboard$/
      );
    });

    test("56 Customer can change password a second time", async ({
      page,
      request,
    }) => {
      const account =
        await seedUser(request);

      await openPassword(
        page,
        "Customer",
        account
      );

      // First password change
      await fillPasswords(page);

      const first =
        await submitWithResponse(page);

      expect(
        first.status()
      ).toBe(200);

      // Second password change
      await fillPasswords(page, {
        old: NEW_PASSWORD,
        fresh: THIRD_PASSWORD,
        again: THIRD_PASSWORD,
      });

      const second =
        await submitWithResponse(page);

      expect(
        second.status()
      ).toBe(200);

      const oldLogin =
        await attemptLogin(
          request,
          account.email,
          NEW_PASSWORD
        );

      expect(
        oldLogin.status()
      ).toBe(401);

      const newLogin =
        await attemptLogin(
          request,
          account.email,
          THIRD_PASSWORD
        );

      expect(
        newLogin.status()
      ).toBe(200);
    });

    test("57 Changing one account password does not affect another", async ({
      request,
    }) => {
      const first =
        await seedUser(request);

      const second =
        await seedUser(request);

      const login =
        await attemptLogin(
          request,
          first.email,
          INITIAL_PASSWORD
        );

      expect(
        login.status()
      ).toBe(200);

      const token = (
        await login.json()
      ).data.token;

      const changed =
        await request.patch(
          `${API}${CHANGE}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
            data: {
              currentPassword:
                INITIAL_PASSWORD,
              newPassword:
                NEW_PASSWORD,
            },
          }
        );

      expect(
        changed.status()
      ).toBe(200);

      // Second account remains unchanged.
      const secondLogin =
        await attemptLogin(
          request,
          second.email,
          INITIAL_PASSWORD
        );

      expect(
        secondLogin.status()
      ).toBe(200);

      // First account's old password fails.
      const firstOldLogin =
        await attemptLogin(
          request,
          first.email,
          INITIAL_PASSWORD
        );

      expect(
        firstOldLogin.status()
      ).toBe(401);

      // First account's new password works.
      const firstNewLogin =
        await attemptLogin(
          request,
          first.email,
          NEW_PASSWORD
        );

      expect(
        firstNewLogin.status()
      ).toBe(200);
    });

    test("58 Change-password API requires JWT", async ({
      request,
    }) => {
      const response =
        await request.patch(
          `${API}${CHANGE}`,
          {
            data: {
              currentPassword:
                INITIAL_PASSWORD,
              newPassword:
                NEW_PASSWORD,
            },
          }
        );

      expect(
        response.status()
      ).toBe(401);
    });

    test("59 Change-password API rejects invalid JWT", async ({
      request,
    }) => {
      const response =
        await request.patch(
          `${API}${CHANGE}`,
          {
            headers: {
              Authorization:
                "Bearer invalid.e2e.token",
            },

            data: {
              currentPassword:
                INITIAL_PASSWORD,
              newPassword:
                NEW_PASSWORD,
            },
          }
        );

      expect(
        response.status()
      ).toBe(401);
    });
  }
);
