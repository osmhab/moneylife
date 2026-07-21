import RequireAdmin from "app/components/RequireAdmin";
import LeadsPageClient from "./_client/LeadsPageClient";

export default function Page() {
  return (
    <RequireAdmin>
      <LeadsPageClient />
    </RequireAdmin>
  );
}