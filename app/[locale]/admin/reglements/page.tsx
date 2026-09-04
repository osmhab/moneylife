import RequireAdmin from "app/components/RequireAdmin";
import ReglementsPageClient from "./_client/ReglementsPageClient";

export default function Page() {
  return (
    <RequireAdmin>
      <ReglementsPageClient />
    </RequireAdmin>
  );
}
