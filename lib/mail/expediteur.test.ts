import { describe, it, expect } from "vitest";

// La règle d'expéditeur est recopiée ici : `creditx-mailer.ts` charge SendGrid
// au niveau du module, ce qu'un test unitaire n'a pas à faire. Le test protège
// donc l'INTENTION — si la liste des domaines change d'un côté, il faut la
// changer des deux.
const DOMAINES_AUTHENTIFIES = ["creditx.ch", "moneylife.ch"];
const REPLI = "no-reply@creditx.ch";

function expediteurConseiller(email?: string, nom?: string) {
  const adresse = String(email || "").trim().toLowerCase();
  const domaine = adresse.split("@")[1] || "";
  if (adresse.includes("@") && DOMAINES_AUTHENTIFIES.includes(domaine)) {
    return { email: adresse, name: nom || undefined };
  }
  return { email: REPLI };
}

describe("expéditeur d'un e-mail de rendez-vous", () => {
  it("part de l'adresse du conseiller quand son domaine est authentifié", () => {
    expect(expediteurConseiller("habib.osmani@creditx.ch", "Habib Osmani"))
      .toEqual({ email: "habib.osmani@creditx.ch", name: "Habib Osmani" });
    expect(expediteurConseiller("a.b@moneylife.ch").email).toBe("a.b@moneylife.ch");
  });

  it("normalise la casse et les espaces d'une adresse recopiée", () => {
    expect(expediteurConseiller("  Habib.Osmani@CreditX.CH  ").email).toBe("habib.osmani@creditx.ch");
  });

  // Sans ce repli, SendGrid refuserait l'envoi et le client n'aurait AUCUNE
  // confirmation d'un rendez-vous pourtant bien posé.
  it("retombe sur l'adresse générique si le domaine n'est pas authentifié", () => {
    for (const a of ["conseiller@gmail.com", "x@ordernowpay.com", "", undefined, "pas-une-adresse"]) {
      expect(expediteurConseiller(a as any).email).toBe(REPLI);
    }
  });
});
