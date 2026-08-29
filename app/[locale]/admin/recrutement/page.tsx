import RequireAdmin from "app/components/RequireAdmin";
import RecrutementPageClient from "./_client/RecrutementPageClient";

export default function Page() {
  return (
    <RequireAdmin>
      <RecrutementPageClient />
    </RequireAdmin>
  );
}
