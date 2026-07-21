//app/admin/clients/[uid]/page.tsx
import AdminClientOverviewClient from "./_client/AdminClientOverviewClient";

export default async function Page() {
  // Le layout gère déjà params + RequireAdmin
  return <AdminClientOverviewClient />;
}