import { describe, it, expect } from "vitest";
import { PDFDocument } from "pdf-lib";
import { assemblerDocument } from "./assemblerDocument";

/** PNG 1×1 valide, suffisant pour vérifier l'assemblage. */
const PNG_1x1 = Uint8Array.from(
  atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="),
  (c) => c.charCodeAt(0),
);

const image = (nom: string) =>
  new File([PNG_1x1.slice().buffer as ArrayBuffer], nom, { type: "image/png" });

describe("assemblerDocument", () => {
  it("une seule page → le fichier est renvoyé tel quel", async () => {
    const f = image("page.png");
    expect(await assemblerDocument([f])).toBe(f);
  });

  // Le cœur du correctif : sans lui, seule la première page était archivée.
  it("trois photos → un PDF de trois pages", async () => {
    const doc = await assemblerDocument([image("1.png"), image("2.png"), image("3.png")], "lpp");
    expect(doc.type).toBe("application/pdf");
    expect(doc.name).toBe("lpp.pdf");

    const pdf = await PDFDocument.load(new Uint8Array(await doc.arrayBuffer()));
    expect(pdf.getPageCount()).toBe(3);
  });

  it("un PDF existant voit ses pages reprises, pas encapsulées", async () => {
    const source = await PDFDocument.create();
    source.addPage([100, 100]);
    source.addPage([100, 100]);
    const octets = await source.save();
    const pdfFile = new File([octets.slice().buffer as ArrayBuffer], "deux.pdf", { type: "application/pdf" });

    const doc = await assemblerDocument([pdfFile, image("photo.png")], "melange");
    const pdf = await PDFDocument.load(new Uint8Array(await doc.arrayBuffer()));
    // 2 pages du PDF + 1 photo = 3, et non 2 documents empilés.
    expect(pdf.getPageCount()).toBe(3);
  });

  // Le repli protège l'existant : une extraction déjà faite ne doit pas être
  // perdue parce qu'une image est illisible par pdf-lib.
  it("image illisible → repli sur le premier fichier plutôt qu'un échec", async () => {
    const casse = new File([new Uint8Array([1, 2, 3]).buffer], "casse.png", { type: "image/png" });
    const doc = await assemblerDocument([casse, image("2.png")], "x");
    expect(doc).toBe(casse);
  });
});
