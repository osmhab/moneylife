//app/admin/clients/page.tsx
import RequireAdmin from "app/components/RequireAdmin";
import ClientsCrmPageClient from "./_client/ClientsCrmPageClient";

export default function Page() {
  return (
    <RequireAdmin>
      <ClientsCrmPageClient />
    </RequireAdmin>
  );
}