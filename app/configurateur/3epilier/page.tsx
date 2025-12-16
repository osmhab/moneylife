// app/configurateur/3epilier/page.tsx

import React from "react";
import RequireAuth from "../../profil/_client/RequireAuth";
import { Configurator3eShell } from "./_client/Configurator3eShell";

export default function Configurateur3ePage() {
  return (
    <RequireAuth>
      <div className="min-h-screen bg-background">
        <div className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-6">

          <Configurator3eShell />
        </div>
      </div>
    </RequireAuth>
  );
}