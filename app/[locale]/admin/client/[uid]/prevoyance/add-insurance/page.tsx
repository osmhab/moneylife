"use client";

import React from "react";
import { useParams, useRouter } from "next/navigation";
// Assure-toi que le chemin d'import correspond bien à la racine de ton projet
import { AddInsurancePlanView } from "app/[locale]/dashboard/prevoyance/add-insurance/page";

export default function AdminAddInsurancePage() {
  const params = useParams();
  const router = useRouter();
  const clientId = params.uid as string;

  return (
    <AddInsurancePlanView 
      onClose={() => router.back()} 
      adminUid={clientId} 
    />
  );
}