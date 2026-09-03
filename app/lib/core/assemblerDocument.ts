// app/lib/core/assemblerDocument.ts
//
// Assemble plusieurs pages scannées en UN SEUL document PDF.
//
// LE PROBLÈME
// -----------
// L'archivage ne retenait que `files[0]`. L'IA recevait bien toutes les pages
// — l'extraction était donc juste — mais le document rattaché au plan, celui
// que le client voit dans son coffre-fort et dans l'app iOS, se limitait à la
// première. Un certificat de prévoyance de trois pages arrivait amputé de deux,
// sans que rien ne le signale.
//
// POURQUOI UN PDF PLUTÔT QU'UNE LISTE D'IMAGES
// --------------------------------------------
// Le coffre-fort, l'app iOS et le bandeau conseiller lisent tous UN champ,
// `metadata.sourceFileUrl`. Passer à une liste imposerait de modifier les trois
// consommateurs — dont l'app iOS, qui suit son propre cycle de livraison. Un PDF
// unique est aussi ce qu'un document de plusieurs pages devrait être : il
// s'ouvre, se feuillette et s'imprime partout, sans rien changer en aval.

import { PDFDocument } from "pdf-lib";

/**
 * Renvoie un fichier unique contenant TOUTES les pages.
 *
 * Un seul fichier en entrée est renvoyé tel quel : inutile de convertir une
 * photo isolée en PDF, on perdrait en qualité d'aperçu pour rien.
 *
 * En cas d'échec (format d'image exotique, HEIC non converti par le téléphone),
 * on retombe sur le premier fichier : mieux vaut le comportement d'avant qu'un
 * scan qui échoue — l'extraction, elle, a déjà eu lieu sur toutes les pages.
 */
export async function assemblerDocument(files: File[], nomBase = "document"): Promise<File> {
  if (files.length === 1) return files[0];

  try {
    const pdf = await PDFDocument.create();

    for (const f of files) {
      const octets = new Uint8Array(await f.arrayBuffer());

      if (f.type === "application/pdf" || /\.pdf$/i.test(f.name || "")) {
        // Un PDF déposé parmi les photos : on recopie ses pages telles quelles.
        const source = await PDFDocument.load(octets);
        const pages = await pdf.copyPages(source, source.getPageIndices());
        for (const p of pages) pdf.addPage(p);
        continue;
      }

      // pdf-lib ne connaît que JPEG et PNG. On tente le format annoncé, puis
      // l'autre : un appareil photo étiquette parfois mal ses fichiers.
      const jpeg = f.type === "image/png" ? false : true;
      let image;
      try {
        image = jpeg ? await pdf.embedJpg(octets) : await pdf.embedPng(octets);
      } catch {
        image = jpeg ? await pdf.embedPng(octets) : await pdf.embedJpg(octets);
      }

      // Une page par photo, exactement aux dimensions de l'image : pas de marge
      // blanche ni de recadrage, le document reste lisible tel qu'il a été pris.
      const page = pdf.addPage([image.width, image.height]);
      page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
    }

    const octets = await pdf.save();
    // `Uint8Array` → `BlobPart` : on passe par un ArrayBuffer propre, certains
    // navigateurs refusant une vue typée directement.
    const blob = new Blob([octets.slice().buffer as ArrayBuffer], { type: "application/pdf" });
    return new File([blob], `${nomBase}.pdf`, { type: "application/pdf" });
  } catch {
    return files[0];
  }
}
