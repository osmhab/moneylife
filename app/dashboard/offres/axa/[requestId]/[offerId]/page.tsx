import RequireAuth from "app/profil/_client/RequireAuth";
import Axa3aWizard from "./_client/Axa3aWizard";

export default async function Axa3aWizardPage({
  params,
}: {
  params: Promise<{ requestId: string; offerId: string }>;
}) {
  const { requestId, offerId } = await params;

  return (
    <RequireAuth>
      <Axa3aWizard requestId={requestId} offerId={offerId} />
    </RequireAuth>
  );
}