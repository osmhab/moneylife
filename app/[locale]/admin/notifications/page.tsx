import RequireAdmin from "app/components/RequireAdmin";
import AdminNotificationsClient from "./_client/AdminNotificationsClient";

export default function Page() {
  return (
    <RequireAdmin>
      <AdminNotificationsClient />
    </RequireAdmin>
  );
}
