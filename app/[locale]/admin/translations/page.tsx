import RequireAdmin from "app/components/RequireAdmin";
import TranslationsEntry from "./_client/TranslationsEntry";

export default function TranslationsAdminPage() {
  return (
    <RequireAdmin>
      <TranslationsEntry />
    </RequireAdmin>
  );
}
