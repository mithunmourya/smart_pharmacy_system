import { useCallback, useEffect, useState } from "react";
import { AuthContext } from "./AuthContext";
import { apiRequest, ApiError } from "../services/api";

function getTokenExpiry(token) {
  try {
    const payload = token.split(".")[1];
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    const decoded = JSON.parse(atob(padded));

    return Number.isFinite(decoded.exp) ? decoded.exp * 1000 : 0;
  } catch {
    return 0;
  }
}

export default function AuthProvider({ children }) {
  const [session, setSession] = useState(null);

  const token = session?.token;
  const expiresAt = session?.expiresAt;

  const logout = useCallback(() => {
    setSession(null);
  }, []);

  const login = useCallback((loginData) => {
    const expiry = getTokenExpiry(loginData.token);

    if (expiry <= Date.now()) {
      throw new Error("Your session has expired. Please sign in again.");
    }

    setSession({
      token: loginData.token,
      user: loginData.user,
      expiresAt: expiry,
    });
  }, []);

  const updateCurrentUser = useCallback((userId, changes) => {
    setSession((current) => {
      if (
        !current ||
        Number(current.user.user_id) !== Number(userId)
      ) {
        return current;
      }

      return {
        ...current,
        user: {
          ...current.user,
          name: changes.name,
          email: changes.email,
        },
      };
    });
  }, []);

  useEffect(() => {
    if (!token) return;

    let timeoutId;

    function checkExpiry() {
      const remaining = expiresAt - Date.now();

      if (remaining <= 0) {
        setSession((current) =>
          current?.token === token ? null : current
        );
        return;
      }

      timeoutId = window.setTimeout(
        checkExpiry,
        Math.min(remaining, 2_147_483_647)
      );
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        window.clearTimeout(timeoutId);
        checkExpiry();
      }
    }

    checkExpiry();

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearTimeout(timeoutId);
      document.removeEventListener(
        "visibilitychange",
        handleVisibilityChange
      );
    };
  }, [token, expiresAt]);

  const authenticatedRequest = useCallback(
    async (path, options = {}) => {
      if (!token || expiresAt <= Date.now()) {
        setSession((current) =>
          current?.token === token ? null : current
        );

        throw new ApiError("Please sign in again.", 401);
      }

      try {
        return await apiRequest(path, {
          ...options,
          token,
        });
      } catch (error) {
        const incorrectCurrentPassword =
          path === "/users/change-password" &&
          error.status === 401 &&
          error.message === "Current password is incorrect.";

        if (error.status === 401 && !incorrectCurrentPassword) {
          setSession((current) =>
            current?.token === token ? null : current
          );
        }

        throw error;
      }
    },
    [token, expiresAt]
  );

  return (
    <AuthContext.Provider
      value={{
        user: session?.user ?? null,
        isAuthenticated: Boolean(session),
        login,
        logout,
        authenticatedRequest,
        updateCurrentUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}