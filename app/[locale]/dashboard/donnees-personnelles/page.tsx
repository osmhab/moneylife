"use client";

import React from "react";
import RequireAuth from "@/[locale]/profil/_client/RequireAuth";
import DonneesPersonnellesEditor from "./_client/DonneesPersonnellesEditor";

export default function DonneesPersonnellesPage() {
  return (
    <RequireAuth>
      <div className="p-4">
        <DonneesPersonnellesEditor />
      </div>
    </RequireAuth>
  );
}