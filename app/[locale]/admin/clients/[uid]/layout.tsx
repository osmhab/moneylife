import RequireAdmin from "app/components/RequireAdmin";
import AdminClientShell from "./_client/AdminClientShell";

export default async function Layout({
  params,
  children,
}: {
  params: Promise<{ uid: string }>;
  children: React.ReactNode;
}) {
  const { uid } = await params;

  return (
    <RequireAdmin>
      <AdminClientShell uid={uid}>{children}</AdminClientShell>
    </RequireAdmin>
  );
}