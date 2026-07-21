import RequireAdmin from "app/components/RequireAdmin";
import Learner3aEntry from "./_client/Learner3aEntry";

export default function Learner3aPage() {
  return (
    <RequireAdmin>
      <Learner3aEntry />
    </RequireAdmin>
  );
}