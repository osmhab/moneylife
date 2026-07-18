import { describe, it, expect } from "vitest";
import { dropBlockingZeroAccident } from "./lpp-rules";

describe("dropBlockingZeroAccident — nettoyage post-scan", () => {
  it("retire le 0 accident quand la maladie correspondante est > 0", () => {
    const data: Record<string, any> = {
      Enter_renteInvaliditeMaladie: 18000,
      Enter_lppRenteInvaliditeAccident: 0, // bloquant → doit disparaître
    };
    dropBlockingZeroAccident(data);
    expect("Enter_lppRenteInvaliditeAccident" in data).toBe(false);
    expect(data.Enter_renteInvaliditeMaladie).toBe(18000);
  });

  it("préserve une valeur accident réelle (> 0)", () => {
    const data: Record<string, any> = {
      Enter_renteConjointLPP: 10800,
      Enter_lppRenteConjointAccident: 10800,
    };
    dropBlockingZeroAccident(data);
    expect(data.Enter_lppRenteConjointAccident).toBe(10800);
  });

  it("préserve un 0 accident si la maladie est aussi 0/absente (rien à mirrorer)", () => {
    const data: Record<string, any> = {
      Enter_renteOrphelinLPP: 0,
      Enter_lppRenteOrphelinAccident: 0,
    };
    dropBlockingZeroAccident(data);
    // Pas de maladie > 0 → on ne touche pas (0 assumé conservé).
    expect(data.Enter_lppRenteOrphelinAccident).toBe(0);
  });

  it("traite les 4 paires de rentes, ne touche pas les capitaux", () => {
    const data: Record<string, any> = {
      Enter_renteInvaliditeMaladie: 100,
      Enter_lppRenteInvaliditeAccident: 0,
      Enter_renteEnfantInvalideMaladie: 200,
      Enter_renteEnfantInvalideAccident: 0,
      Enter_renteConjointLPP: 300,
      Enter_lppRenteConjointAccident: 0,
      Enter_renteOrphelinLPP: 400,
      Enter_lppRenteOrphelinAccident: 0,
      // Capitaux : hors périmètre (fallback différent) → intacts.
      Enter_CapitalAucuneRenteMal: 500,
      Enter_CapitalAucuneRenteAcc: 0,
    };
    dropBlockingZeroAccident(data);
    expect("Enter_lppRenteInvaliditeAccident" in data).toBe(false);
    expect("Enter_renteEnfantInvalideAccident" in data).toBe(false);
    expect("Enter_lppRenteConjointAccident" in data).toBe(false);
    expect("Enter_lppRenteOrphelinAccident" in data).toBe(false);
    expect(data.Enter_CapitalAucuneRenteAcc).toBe(0); // capitaux non touchés
  });
});
