// app/client/[token]/offres/page.tsx
import { db } from "@/lib/firebaseAdmin";
import Actions from "./Actions";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = {
  robots: { index: false, follow: false },
};

function chf(n?: number) {
  if (typeof n !== "number" || Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("fr-CH", {
    style: "currency",
    currency: "CHF",
    maximumFractionDigits: 2,
  }).format(n);
}

export default async function OffresClientPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  try {
    // --- 1) Offres partenaires (collection 'quotes') : pour "Choisir & signer"
    const quotesSnap = await db
      .collection("quotes")
      .where("clientToken", "==", token)
      .orderBy("createdAt", "desc")
      .limit(100)
      .get();

    const quotes = quotesSnap.docs.map((d) => {
      const q: any = d.data();
      return {
        id: d.id,
        assureur: q.assureur ?? "—",
        produit: q.produit ?? "—",
        primeMois: typeof q.primeMois === "number" ? q.primeMois : undefined,
        primeAn: typeof q.primeAn === "number" ? q.primeAn : undefined,
        partnerEmail: q.partnerEmail ?? null,
        status: q.status ?? "received",
        createdAt: q.createdAt?.toDate?.() ?? null,
      };
    });

    // --- 2) Éléments détectés depuis documents (collection 'offers_parsed') : read-only
    const parsedSnap = await db
      .collection("offers_parsed")
      .where("clientToken", "==", token)
      .orderBy("extractedAt", "desc")
      .limit(100)
      .get();

    const parsed = parsedSnap.docs.map((d) => {
      const p: any = d.data();
      return {
        id: d.id,
        filename: p.filename || (p.sourcePath ? String(p.sourcePath).split("/").pop() : undefined),
        assureur: p.assureur ?? "—",
        produit: p.produit ?? "—",
        primeMensuelleCHF:
          typeof p.primeMois === "number" ? p.primeMois : undefined,
        primeAnnuelleCHF:
        typeof p.primeAn === "number" ? p.primeAn : undefined,
        duree: p.duree ?? "—",
        participation: p.participation ?? "—",
        rendementProjete: p.rendementProjete ?? "—",
        remarques: p.remarques ?? "",
        extractedAt: p.extractedAt?.toDate?.() ?? null,
      };
    });

    return (
      <main className="max-w-5xl mx-auto px-6 py-8">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold">Vos offres 3ᵉ pilier</h1>
          <p className="text-sm text-gray-500">
            Lien sécurisé&nbsp;:{" "}
            <span className="font-mono">
              {token.length > 10 ? `${token.slice(0, 6)}…${token.slice(-4)}` : token}
            </span>
          </p>
        </header>

        {/* Offres partenaires (avec Choisir & signer) */}
        <section className="mb-10">
          <div className="flex items-end justify-between mb-3">
            <h2 className="text-lg font-medium">Offres partenaires</h2>
            <span className="text-xs text-gray-500">{quotes.length} offre(s)</span>
          </div>

          {quotes.length === 0 ? (
            <div className="rounded-xl border p-6 text-gray-600">
              Aucune offre partenaire reçue pour l’instant.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50">
                  <tr className="[&>th]:px-4 [&>th]:py-3 text-left">
                    <th>Assureur</th>
                    <th>Produit</th>
                    <th className="whitespace-nowrap">Prime / mois</th>
                    <th className="whitespace-nowrap">Prime / an</th>
                    <th>Statut</th>
                    <th className="text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="[&>tr>td]:px-4 [&>tr>td]:py-3 divide-y">
                  {quotes.map((q) => (
                    <tr key={q.id} className="hover:bg-gray-50">
                      <td className="font-medium">{q.assureur}</td>
                      <td>{q.produit}</td>
                      <td className="whitespace-nowrap">{chf(q.primeMois)}</td>
                      <td className="whitespace-nowrap">{chf(q.primeAn)}</td>
                      <td>
                        <span
                          className={[
                            "inline-block rounded-full px-2 py-0.5 text-xs",
                            q.status === "chosen"
                              ? "bg-[#4fd1c5]/10 text-[#0f766e]"
                              : "bg-gray-100 text-gray-700",
                          ].join(" ")}
                        >
                          {q.status}
                        </span>
                      </td>
                      <td className="text-right">
                        {q.status === "chosen" ? (
                          <span className="text-xs text-[#0f766e]">Choisie</span>
                        ) : (
                          <Actions
                            quoteId={q.id}
                            partnerEmail={q.partnerEmail ?? "partner@assureur.ch"}
                            clientToken={token}
                          />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Éléments détectés (OCR/OpenAI) */}
        <section>
          <div className="flex items-end justify-between mb-3">
            <h2 className="text-lg font-medium">Éléments détectés depuis vos documents</h2>
            <span className="text-xs text-gray-500">{parsed.length} élément(s)</span>
          </div>

          {parsed.length === 0 ? (
            <div className="rounded-xl border p-6 text-gray-600">
              Pas encore d’éléments détectés.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50">
                  <tr className="[&>th]:px-4 [&>th]:py-3 text-left">
                    <th>Assureur</th>
                    <th>Produit</th>
                    <th className="whitespace-nowrap">Prime / mois</th>
                    <th className="whitespace-nowrap">Prime / an</th>
                    <th>Durée</th>
                    <th>Particip. bénéfices</th>
                    <th className="whitespace-nowrap">Rendement proj.</th>
                    <th>Remarques</th>
                    <th>Date</th>
                    <th className="text-right">Source</th>
                  </tr>
                </thead>
                <tbody className="[&>tr>td]:px-4 [&>tr>td]:py-3 divide-y">
                  {parsed.map((r) => (
                    <tr key={r.id} className="hover:bg-gray-50">
                      <td className="font-medium">{r.assureur}</td>
                      <td>{r.produit}</td>
                      <td className="whitespace-nowrap">{chf(r.primeMensuelleCHF)}</td>
                      <td className="whitespace-nowrap">{chf(r.primeAnnuelleCHF)}</td>
                      <td>{r.duree}</td>
                      <td>{r.participation}</td>
                      <td className="whitespace-nowrap">{r.rendementProjete || "—"}</td>
                      <td className="max-w-[24rem]">
                        <span className="line-clamp-2">{r.remarques || "—"}</span>
                      </td>
                      <td className="whitespace-nowrap">
                        {r.extractedAt ? r.extractedAt.toLocaleDateString("fr-CH") : "—"}
                      </td>
                      <td className="text-right">
                        <span className="font-mono text-xs text-gray-500">
                          {r.filename ?? "—"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-xs text-gray-400 mt-4 px-4 pb-4">
                Données détectées automatiquement (OCR + IA). Vérifiez toujours les
                conditions officielles de l’assureur.
              </p>
            </div>
          )}
        </section>
      </main>
    );
  } catch (err) {
    console.error("[offres/page] Firestore error:", err);
    return (
      <main className="max-w-3xl mx-auto px-6 py-8">
        <h1 className="text-2xl font-semibold mb-4">Vos offres 3ᵉ pilier</h1>
        <div className="rounded-xl border p-6 text-red-700 bg-red-50">
          Impossible de charger les offres pour le moment. Réessaie plus tard.
        </div>
      </main>
    );
  }
}
