// app/dashboard/offres/swisslife/[requestId]/[offerId]/page.tsx
import SwissLife3aWizard from "./_client/SwissLife3aWizard";

export default function SwissLife3aWizardPage({
  params,
}: {
  params: { requestId: string; offerId: string };
}) {
  return <SwissLife3aWizard requestId={params.requestId} offerId={params.offerId} />;
}