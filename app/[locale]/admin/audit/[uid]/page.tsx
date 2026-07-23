import RequireAdmin from "app/components/RequireAdmin";
import AuditTrailClient from "./_client/AuditTrailClient";

export default async function Page({ params }: { params: Promise<{ uid: string }> }) {
  const { uid } = await params;
  return (
    <RequireAdmin>
      <AuditTrailClient uid={uid} />
    </RequireAdmin>
  );
}
