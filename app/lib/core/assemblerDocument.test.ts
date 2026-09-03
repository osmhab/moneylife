import { describe, it, expect } from "vitest";
import { PDFDocument } from "pdf-lib";
import { assemblerDocument, orientationExif } from "./assemblerDocument";

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

describe("format de page et orientation", () => {
  it("la page est un A4, jamais les pixels de la photo", async () => {
    // Le défaut d'origine : une photo 4032×3024 donnait une page de 4032×3024
    // POINTS, soit 142 × 107 cm. Les lecteurs affichaient le coin d'une feuille
    // géante — une marge blanche, prise pour un document vide.
    const doc = await assemblerDocument([image("1.png"), image("2.png")], "lpp");
    const pdf = await PDFDocument.load(new Uint8Array(await doc.arrayBuffer()));
    for (const p of pdf.getPages()) {
      const { width, height } = p.getSize();
      expect(Math.max(width, height)).toBeLessThanOrEqual(842);
      expect(Math.min(width, height)).toBeGreaterThanOrEqual(595 - 1);
    }
  });

  it("lit l'orientation EXIF d'un JPEG", () => {
    // JPEG minimal portant un APP1/Exif avec Orientation = 6 (rotation 90°).
    const exif = [
      0xff, 0xd8,                                     // SOI
      0xff, 0xe1, 0x00, 0x22,                         // APP1, taille 34
      0x45, 0x78, 0x69, 0x66, 0x00, 0x00,             // "Exif\0\0"
      0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08, // TIFF gros-boutiste, IFD à 8
      0x00, 0x01,                                     // 1 entrée
      0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, // balise Orientation, SHORT
      0x00, 0x06, 0x00, 0x00,                         // valeur 6
    ];
    expect(orientationExif(Uint8Array.from(exif))).toBe(90);
  });

  it("une image sans EXIF n'est pas pivotée", () => {
    expect(orientationExif(PNG_1x1)).toBe(0);
    expect(orientationExif(Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]))).toBe(0);
  });
});
