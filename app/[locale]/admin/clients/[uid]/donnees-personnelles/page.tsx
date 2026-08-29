//app/admin/clients/[uid]/donnees-personnelles/page.tsx
import RequireAdmin from "app/components/RequireAdmin";
import DonneesPersonnellesEditor from "@/[locale]/dashboard/donnees-personnelles/_client/DonneesPersonnellesEditor";

export default async function Page({
  params,
}: {
  params: Promise<{ uid: string }>;
}) {
  const { uid } = await params;

  return (
    <RequireAdmin>
      <DonneesPersonnellesEditor targetUid={uid} admin />
    </RequireAdmin>
  );
}
