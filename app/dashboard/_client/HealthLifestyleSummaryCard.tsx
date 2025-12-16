//app/dashboard/_client/HealthLifestyleSummaryCard.tsx
"use client";

import React, { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { collection, getDocs, limit, orderBy, query } from "firebase/firestore";

import { auth, db } from "@/lib/firebase";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, HeartPulse, Cigarette, Globe2 } from "lucide-react";

type HealthDoc = {
  profession?: string | null;
  isSmoker?: boolean;
  cigarettesPerDay?: number | null;
  hasHypertension?: boolean;
  hasHighCholesterol?: boolean;
  heightCm?: number | null;
  weightKg?: number | null;
  bmi?: number | null;
  countryResidence?: string;
  doesPhysicalWork?: "yes" | "no";
  hasHigherEducation?: "yes" | "no";
  degreeLabel?: string;
  degreeSchool?: string;
  isUsCitizenOrResident?: "yes" | "no";
  isUsTaxableOther?: "yes" | "no";
  healthBlockUs?: boolean;
  updatedAt?: number;
};

const formatYesNo = (val?: boolean) =>
  val === true ? "Oui" : val === false ? "Non" : "—";

const formatYesNoStr = (val?: "yes" | "no") =>
  val === "yes" ? "Oui" : val === "no" ? "Non" : "—";

const HealthLifestyleSummaryCard: React.FC = () => {
  const [health, setHealth] = useState<HealthDoc | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubAuth: (() => void) | undefined;

    unsubAuth = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setHealth(null);
        setLoading(false);
        return;
      }

      try {
        const qRef = query(
          collection(db, "clients", user.uid, "health_lifestyle_3epilier"),
          orderBy("updatedAt", "desc"),
          limit(1)
        );
        const snap = await getDocs(qRef);
        if (snap.empty) {
          setHealth(null);
        } else {
          const data = snap.docs[0].data() as any;
          setHealth(data as HealthDoc);
        }
      } catch (e) {
        console.error("[Dashboard] load health_lifestyle_3epilier error:", e);
        setHealth(null);
      } finally {
        setLoading(false);
      }
    });

    return () => {
      if (unsubAuth) unsubAuth();
    };
  }, []);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div>
          <CardTitle className="text-sm font-medium">
            Santé &amp; lifestyle – résumé
          </CardTitle>
          <p className="text-[11px] text-muted-foreground mt-1">
            Facteurs utilisés pour calculer la prime de risque.
          </p>
        </div>
        <Badge variant="outline" className="text-[10px]">
          Santé
        </Badge>
      </CardHeader>
      <CardContent className="space-y-3 text-xs">
        {loading && <p className="text-muted-foreground">Chargement…</p>}

        {!loading && !health && (
          <p className="text-muted-foreground">
            Le questionnaire Santé &amp; Lifestyle n&apos;a pas encore été complété.
          </p>
        )}

        {!loading && health && (
          <>
            {/* Profession */}
            {health.profession && (
              <div className="flex items-start gap-2">
                <ShieldCheck className="h-3.5 w-3.5 mt-0.5 text-primary" />
                <div>
                  <p className="text-[11px] font-medium">Profession principale</p>
                  <p>{health.profession}</p>
                </div>
              </div>
            )}

            {/* Pays & statut US */}
            <div className="flex items-start gap-2">
              <Globe2 className="h-3.5 w-3.5 mt-0.5 text-primary" />
              <div>
                <p className="text-[11px] font-medium">Pays & statut US</p>
                <p>
                  Pays de résidence :{" "}
                  <span className="font-medium">
                    {health.countryResidence || "Non renseigné"}
                  </span>
                </p>
                <p>
                  Nationalité / domicile US :{" "}
                  <span className="font-medium">
                    {formatYesNoStr(health.isUsCitizenOrResident as any)}
                  </span>
                  {" · "}
                  Imposable US pour d&apos;autres raisons :{" "}
                  <span className="font-medium">
                    {formatYesNoStr(health.isUsTaxableOther as any)}
                  </span>
                </p>
                {health.healthBlockUs && (
                  <p className="mt-1 text-[11px] text-red-600 font-medium">
                    ⚠️ Ce statut bloque la souscription à ce produit.
                  </p>
                )}
              </div>
            </div>

            {/* Tabac */}
            <div className="flex items-start gap-2">
              <Cigarette className="h-3.5 w-3.5 mt-0.5 text-primary" />
              <div>
                <p className="text-[11px] font-medium">Tabac</p>
                <p>
                  Fumeur / fumeuse :{" "}
                  <span className="font-medium">
                    {formatYesNo(health.isSmoker)}
                  </span>
                </p>
                {health.isSmoker && (
                  <p>
                    Cigarettes / jour :{" "}
                    <span className="font-medium">
                      {health.cigarettesPerDay ?? "Non renseigné"}
                    </span>
                  </p>
                )}
              </div>
            </div>

            {/* Taille / poids / IMC & tension */}
            <div className="flex items-start gap-2">
              <HeartPulse className="h-3.5 w-3.5 mt-0.5 text-primary" />
              <div>
                <p className="text-[11px] font-medium">État de santé</p>
                <p>
                  Taille / poids :{" "}
                  <span className="font-medium">
                    {health.heightCm ?? "?"} cm / {health.weightKg ?? "?"} kg
                  </span>
                </p>
                <p>
                  IMC estimé :{" "}
                  <span className="font-medium">
                    {health.bmi ? health.bmi.toFixed(1) : "Non calculé"}
                  </span>
                </p>
                <p>
                  Hypertension :{" "}
                  <span className="font-medium">
                    {formatYesNo(health.hasHypertension)}
                  </span>
                  {" · "}
                  Cholestérol élevé :{" "}
                  <span className="font-medium">
                    {formatYesNo(health.hasHighCholesterol)}
                  </span>
                </p>
              </div>
            </div>

            {/* Études / travail physique */}
            <div className="grid grid-cols-2 gap-2 pt-1 text-[11px] text-muted-foreground">
              <p>
                Études supérieures :{" "}
                <span className="font-medium">
                  {formatYesNoStr(health.hasHigherEducation as any)}
                </span>
              </p>
              <p>
                Travail manuel &gt;4h/sem :{" "}
                <span className="font-medium">
                  {formatYesNoStr(health.doesPhysicalWork as any)}
                </span>
              </p>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default HealthLifestyleSummaryCard;