import RequireAdmin from "app/components/RequireAdmin";
import OffresWizardEntry from "./_client/OffresWizardEntry";

export default function AdminOffresWizardPage() {
  return (
    <RequireAdmin>
      <OffresWizardEntry />
    </RequireAdmin>
  );
}