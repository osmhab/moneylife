// app/profil/wizard/page.tsx
"use client";

import React from "react";
import RequireAuth from "../_client/RequireAuth";
import ProfilUnifiedForm from "../_client/ProfilUnifiedForm";

export default function WizardPage() {
  return (
    <RequireAuth>
      <div className="p-4">
        <ProfilUnifiedForm />
      </div>
    </RequireAuth>
  );
}