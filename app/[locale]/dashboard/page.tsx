// app/dashboard/page.tsx
import { redirect } from "next/navigation";

export default function DashboardIndex() {
  // Redirection immédiate et invisible vers la page principale
  redirect("/dashboard/prevoyance");
}