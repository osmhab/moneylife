// app/[locale]/admin/parrainage/page.tsx
import RequireAdmin from "app/components/RequireAdmin";
import ParrainagePageClient from "./_client/ParrainagePageClient";

export default function Page() {
  return (
    <RequireAdmin>
      <ParrainagePageClient />
    </RequireAdmin>
  );
}
