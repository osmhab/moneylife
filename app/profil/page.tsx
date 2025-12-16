"use client";

import React from "react";
import RequireAuth from "./_client/RequireAuth";
import ProfilUnifiedForm from "./_client/ProfilUnifiedForm";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import Link from "next/link";

export default function ProfilPage() {
  return (
    <RequireAuth
      redirectTo="/(auth)/login"
      fallback={
        <div className="mx-auto max-w-3xl p-6">
          <Card>
            <CardHeader>
              <CardTitle>Vérification de la session…</CardTitle>
            </CardHeader>
            <CardContent>Un instant ⏳</CardContent>
          </Card>
        </div>
      }
    >
      <div className="mx-auto max-w-3xl space-y-8 p-4">
        {/* --- Mon profil + LPP (formulaire unifié) --- */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Mon profil &amp; LPP</CardTitle>
            {/* Le scan certificat est intégré dans le formulaire unifié */}
          </CardHeader>
          <CardContent>
            <ProfilUnifiedForm />
          </CardContent>
        </Card>

        {/* --- Lien vers résultats --- */}
        <div className="flex justify-center pt-4">
          <Link href="/profil/results" className="text-primary underline">
            Voir mes prestations calculées
          </Link>
        </div>
      </div>
    </RequireAuth>
  );
}