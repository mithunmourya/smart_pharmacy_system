import { Navigate } from "react-router";

import useAuth from "../hooks/useAuth";

import AdminDashboard from "./dashboard/AdminDashboard";
import PharmacistDashboard from "./dashboard/PharmacistDashboard";
import CustomerDashboard from "./dashboard/CustomerDashboard";

export default function Dashboard() {
  const { user } = useAuth();

  if (!user) {
    return null;
  }

  switch (user.role) {
    case "Admin":
      return <AdminDashboard />;

    case "Pharmacist":
      return <PharmacistDashboard />;

    case "Customer":
      return <CustomerDashboard />;

    default:
      return <Navigate to="/forbidden" replace />;
  }
}