"use client";

import RequireAdmin from "../../components/RequireAdmin";
import BackofficeHome from "./_client/BackofficeHome";

export default function AdminDashboardPage() {
  return (
    <RequireAdmin>
      <div className="p-4 md:p-6">
        <BackofficeHome />
      </div>
    </RequireAdmin>
  );
}