import RequireAdmin from "app/components/RequireAdmin";
import AnalysesPageClient from "./_client/AnalysesPageClient";

export default function Page() {
  return (
    <RequireAdmin>
      <AnalysesPageClient />
    </RequireAdmin>
  );
}
