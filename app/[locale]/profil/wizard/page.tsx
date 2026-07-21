import { redirect } from "next/navigation";

// On le passe en composant Serveur (on enlève le "use client")
export default async function WizardPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  
  // Redirige instantanément et silencieusement le client vers son tableau de bord
  redirect(`/${locale}/dashboard/prevoyance`);
}