import { Link, Navigate, Route, Routes } from "react-router";

import AuthLayout from "./layouts/AuthLayout";
import DashboardLayout from "./layouts/DashboardLayout";

import Login from "./pages/auth/Login";
import Dashboard from "./pages/Dashboard";
import MyProfile from "./pages/profile/MyProfile";
import ChangePassword from "./pages/settings/ChangePassword";

import Users from "./pages/users/Users";
import Manufacturers from "./pages/manufacturers/Manufacturers";
import Medicines from "./pages/medicines/Medicines";
import Batches from "./pages/batches/Batches";
import StockOverview from "./pages/inventory/StockOverview";

import NewSale from "./pages/sales/NewSale";
import SalesHistory from "./pages/sales/SalesHistory";
import MyPurchases from "./pages/purchases/MyPurchases";

import ProtectedRoute from "./routes/ProtectedRoute";
import useAuth from "./hooks/useAuth";

function ForbiddenPage() {
  return (
    <section className="rounded-2xl border border-border bg-surface p-6 sm:p-8">
      <h1 className="text-2xl font-bold">Access denied</h1>

      <p className="mt-3 text-text-secondary">
        Your account does not have permission to view this page.
      </p>

      <Link
        to="/dashboard"
        className="mt-6 inline-flex min-h-11 items-center
                   rounded-lg bg-primary px-4 py-2
                   text-sm font-semibold text-white
                   hover:bg-primary-hover
                   focus-visible:outline-2
                   focus-visible:outline-offset-2
                   focus-visible:outline-primary"
      >
        Return to dashboard
      </Link>
    </section>
  );
}

export default function App() {
  const { isAuthenticated } = useAuth();

  const homePath = isAuthenticated ? "/dashboard" : "/login";

  return (
    <Routes>
      <Route
        path="/login"
        element={
          isAuthenticated ? (
            <Navigate to="/dashboard" replace />
          ) : (
            <AuthLayout>
              <Login />
            </AuthLayout>
          )
        }
      />

      <Route element={<ProtectedRoute />}>
        <Route element={<DashboardLayout />}>
          {/* All signed-in users */}
          <Route path="/dashboard" element={<Dashboard />} />

          <Route path="/profile" element={<MyProfile />} />

          <Route
            path="/settings/change-password"
            element={<ChangePassword />}
          />

          {/* Admin */}
          <Route
            element={<ProtectedRoute allowedRoles={["Admin"]} />}
          >
            <Route path="/users" element={<Users />} />

            <Route
              path="/manufacturers"
              element={<Manufacturers />}
            />

            <Route path="/medicines" element={<Medicines />} />

            <Route path="/batches" element={<Batches />} />

            <Route path="/sales" element={<SalesHistory />} />
          </Route>

          {/* Admin and Pharmacist */}
          <Route
            element={
              <ProtectedRoute
                allowedRoles={["Admin", "Pharmacist"]}
              />
            }
          >
            <Route
              path="/inventory"
              element={
                <StockOverview
                  key="inventory"
                  mode="inventory"
                />
              }
            />

            <Route
              path="/low-stock"
              element={
                <StockOverview
                  key="low-stock"
                  mode="low-stock"
                />
              }
            />
          </Route>

          {/* Pharmacist */}
          <Route
            element={
              <ProtectedRoute allowedRoles={["Pharmacist"]} />
            }
          >
            <Route path="/sales/new" element={<NewSale />} />
          </Route>

          {/* Customer */}
          <Route
            element={
              <ProtectedRoute allowedRoles={["Customer"]} />
            }
          >
            <Route
              path="/my-purchases"
              element={<MyPurchases />}
            />
          </Route>

          <Route path="/forbidden" element={<ForbiddenPage />} />
        </Route>
      </Route>

      <Route path="/" element={<Navigate to={homePath} replace />} />

      <Route path="*" element={<Navigate to={homePath} replace />} />
    </Routes>
  );
}