import { describe, it, expect } from "vitest";
import { choixModele } from "./analyseIA";

describe("choix du moteur d'analyse", () => {
  it("lit le fournisseur et le modèle", () => {
    expect(choixModele("openai:gpt-5.6-sol")).toEqual({ fournisseur: "openai", modele: "gpt-5.6-sol" });
    expect(choixModele("gemini:gemini-2.5-flash")).toEqual({ fournisseur: "gemini", modele: "gemini-2.5-flash" });
  });

  it("retombe sur le défaut ÉPROUVÉ quand la valeur est illisible", () => {
    // Une variable d'environnement mal saisie ne doit jamais faire basculer la
    // lecture d'un règlement sur un moteur non mesuré — encore moins la casser.
    for (const brut of ["", "openai", "gpt-5.6-sol", "anthropic:claude", "n'importe quoi", undefined]) {
      expect(choixModele(brut)).toEqual({ fournisseur: "gemini", modele: "gemini-2.5-flash" });
    }
  });

  it("accepte n'importe quel modèle du fournisseur, sans liste figée", () => {
    // Les modèles sortent plus vite que nos déploiements : figer une liste
    // obligerait à livrer du code pour essayer un candidat.
    expect(choixModele("gemini:gemini-3.8-flash").modele).toBe("gemini-3.8-flash");
    expect(choixModele("openai:gpt-5.5-pro").fournisseur).toBe("openai");
  });
});
