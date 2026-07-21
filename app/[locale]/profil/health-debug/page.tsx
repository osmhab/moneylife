"use client";

import React, { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
} from "firebase/firestore";

import RequireAuth from "../_client/RequireAuth";
import type { HealthQuestionnaire3e } from "@/lib/core/types";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

export default function HealthDebugPage() {
  const [uid, setUid] = useState<string | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);

  const [questionnaire, setQuestionnaire] =
    useState<HealthQuestionnaire3e | null>(null);
  const [loadingQuestionnaire, setLoadingQuestionnaire] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Récupérer l'uid du user via Firebase Auth
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user?.uid) {
        setUid(user.uid);
      } else {
        setUid(null);
      }
      setLoadingUser(false);
    });
    return () => unsub();
  }, []);

  // Charger le dernier questionnaire santé du client
  useEffect(() => {
    if (!uid) return;
    setLoadingQuestionnaire(true);
    setError(null);

    (async () => {
      try {
        const qRef = collection(
          db,
          "clients",
          uid,
          "health_questionnaires"
        );
        const q = query(qRef, orderBy("updatedAt", "desc"), limit(1));
        const snap = await getDocs(q);

        if (snap.empty) {
          setQuestionnaire(null);
        } else {
          const docSnap = snap.docs[0];
          setQuestionnaire(docSnap.data() as HealthQuestionnaire3e);
        }
      } catch (err: any) {
        console.error("[HealthDebug] Erreur chargement questionnaire :", err);
        setError("Impossible de charger le questionnaire de santé.");
      } finally {
        setLoadingQuestionnaire(false);
      }
    })();
  }, [uid]);

  return (
    <RequireAuth>
      <div className="min-h-[100vh] bg-background px-4 py-6">
        <div className="mx-auto w-full max-w-3xl space-y-4">
          <header className="space-y-1">
            <p className="text-xs text-muted-foreground">Debug</p>
            <h1 className="text-xl font-semibold">
              Questionnaire de santé (Health Debug)
            </h1>
            <p className="text-xs text-muted-foreground">
              Cette page permet de visualiser le dernier questionnaire de santé
              enregistré pour l&apos;utilisateur connecté. Elle est destinée au
              développement et aux tests internes.
            </p>
          </header>

          {loadingUser || loadingQuestionnaire ? (
            <p className="text-sm text-muted-foreground">
              Chargement du questionnaire…
            </p>
          ) : error ? (
            <p className="text-sm text-red-600">{error}</p>
          ) : !questionnaire ? (
            <p className="text-sm text-muted-foreground">
              Aucun questionnaire de santé enregistré pour l&apos;instant.
            </p>
          ) : (
            <>
              {/* Infos générales */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">
                    Informations générales
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-1 text-xs text-muted-foreground">
                  <p>
                    <span className="font-semibold">ID questionnaire :</span>{" "}
                    <span className="font-mono">{questionnaire.id}</span>
                  </p>
                  <p>
                    <span className="font-semibold">Client UID :</span>{" "}
                    <span className="font-mono">
                      {questionnaire.clientUid}
                    </span>
                  </p>
                  <p>
                    <span className="font-semibold">Nombre de cases :</span>{" "}
                    {questionnaire.cases?.length ?? 0}
                  </p>
                  <p>
                    <span className="font-semibold">
                      Nombre de réponses enregistrées :
                    </span>{" "}
                    {questionnaire.answers?.length ?? 0}
                  </p>
                </CardContent>
              </Card>

              {/* Cases (Ostéo / Cardio / Psy / autres) */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">
                    Cas médicaux détectés
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {questionnaire.cases && questionnaire.cases.length > 0 ? (
                    questionnaire.cases.map((c) => (
                      <div
                        key={c.id}
                        className="rounded-md border bg-muted/40 px-3 py-2"
                      >
                        <p className="text-xs font-semibold mb-1">
                          Case ID :{" "}
                          <span className="font-mono">{c.id}</span>
                        </p>
                        <p className="text-xs text-muted-foreground mb-1">
                          Catégorie :{" "}
                          <span className="font-semibold">
                            {c.category || "—"}
                          </span>
                        </p>
                        <p className="text-xs text-muted-foreground mb-1">
                          Titre :{" "}
                          <span className="font-semibold">
                            {c.title || "—"}
                          </span>
                        </p>

                        {c.rawNotes && c.rawNotes.length > 0 && (
                          <div className="mt-2 space-y-1">
                            <p className="text-[11px] font-semibold">
                              Notes brutes liées à ce cas :
                            </p>
                            <ul className="list-disc pl-4 space-y-0.5">
                              {c.rawNotes.map((note, idx) => (
                                <li
                                  key={idx}
                                  className="text-[11px] text-muted-foreground"
                                >
                                  {note}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Aucun cas médical structuré pour l&apos;instant.
                    </p>
                  )}
                </CardContent>
              </Card>

              {/* Journal complet des réponses */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">
                    Journal des réponses (answers)
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-1">
                  {questionnaire.answers && questionnaire.answers.length > 0 ? (
                    <div className="space-y-1">
                      {questionnaire.answers.map((ans) => (
                        <div
                          key={ans.id}
                          className="rounded-md border bg-background px-3 py-2 text-[11px]"
                        >
                          <p className="font-mono text-[10px] text-muted-foreground mb-1">
                            {ans.id} — {ans.questionId}
                          </p>
                          <p className="font-semibold">
                            Q : {ans.questionLabel}
                          </p>
                          <p>
                            <span className="font-semibold">R :</span>{" "}
                            {ans.rawAnswer || "—"}
                          </p>
                          {ans.linkedCaseId && (
                            <p className="text-[10px] text-muted-foreground mt-1">
                              Case lié :{" "}
                              <span className="font-mono">
                                {ans.linkedCaseId}
                              </span>
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Aucun answer enregistré pour ce questionnaire.
                    </p>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </div>
    </RequireAuth>
  );
}