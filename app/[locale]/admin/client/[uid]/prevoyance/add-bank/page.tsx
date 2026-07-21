"use client";

import React from "react";
import { useParams, useRouter } from "next/navigation";
// Assure-toi que le chemin d'import correspond bien à la racine de ton projet
import { AddBankPlanView } from "app/[locale]/dashboard/prevoyance/add-bank/page";

export default function AdminAddBankPage() {
  const params = useParams();
  const router = useRouter();
  const clientId = params.uid as string;

  return (
    <AddBankPlanView 
      onClose={() => router.back()} 
      adminUid={clientId} 
    />
  );
}