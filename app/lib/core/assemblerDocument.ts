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

import { PDFDocument, degrees } from "pdf-lib";

/** A4 en points PostScript (72 dpi) : 21 × 29,7 cm. */
const A4_COURT = 595;
const A4_LONG = 842;

/**
 * Rotation à appliquer à une photo, lue dans son EXIF, en degrés horaires.
 *
 * Un téléphone n'oriente pas les pixels : il les enregistre tels que le capteur
 * les a vus et note la rotation à appliquer. Tout visionneur d'images la
 * respecte ; `pdf-lib`, non. Sans cette lecture, un certificat photographié en
 * portrait arrive couché dans le PDF.
 *
 * On ne parcourt que l'en-tête APP1 du JPEG — inutile de charger une
 * bibliothèque EXIF complète pour une seule balise.
 */
export function orientationExif(octets: Uint8Array): 0 | 90 | 180 | 270 {
  try {
    if (octets[0] !== 0xff || octets[1] !== 0xd8) return 0;      // pas un JPEG
    const vue = new DataView(octets.buffer, octets.byteOffset, octets.byteLength);
    let i = 2;

    while (i < vue.byteLength - 4) {
      if (vue.getUint8(i) !== 0xff) return 0;                     // segments désynchronisés
      const marqueur = vue.getUint8(i + 1);
      const taille = vue.getUint16(i + 2);
      if (marqueur === 0xda) return 0;                            // début de l'image : plus d'EXIF

      if (marqueur === 0xe1 && vue.getUint32(i + 4) === 0x45786966) {
        const tiff = i + 10;                                      // après "Exif\0\0"
        const petitBoutiste = vue.getUint16(tiff) === 0x4949;
        const u16 = (o: number) => vue.getUint16(o, petitBoutiste);
        const u32 = (o: number) => vue.getUint32(o, petitBoutiste);

        const ifd = tiff + u32(tiff + 4);
        const nb = u16(ifd);
        for (let e = 0; e < nb; e++) {
          const champ = ifd + 2 + e * 12;
          if (u16(champ) === 0x0112) {                            // balise Orientation
            switch (u16(champ + 8)) {
              case 3: return 180;
              case 6: return 90;
              case 8: return 270;
              default: return 0;
            }
          }
        }
        return 0;
      }
      i += 2 + taille;
    }
  } catch {
    // EXIF illisible : on préfère une image non pivotée à un scan qui échoue.
  }
  return 0;
}

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

      // Un téléphone enregistre la photo dans le capteur puis note la rotation
      // à appliquer en EXIF. `pdf-lib` ne lit pas l'EXIF : sans cette correction,
      // un certificat photographié en portrait se retrouve couché dans le PDF.
      const rotation = orientationExif(octets);
      const pivote = rotation === 90 || rotation === 270;
      const largeurUtile = pivote ? image.height : image.width;
      const hauteurUtile = pivote ? image.width : image.height;

      // ⚠️ NE PAS dimensionner la page en PIXELS. Une photo de 4032×3024 donnait
      // une page de 4032×3024 POINTS, soit 142 × 107 cm. Les lecteurs qui
      // n'ajustent pas à la page affichaient alors le coin d'une feuille d'un
      // mètre quarante — c'est-à-dire une marge blanche, d'où l'impression d'un
      // document vide. On garde donc un format A4 et on y insère la photo.
      const [pw, ph] = largeurUtile > hauteurUtile ? [A4_LONG, A4_COURT] : [A4_COURT, A4_LONG];
      const page = pdf.addPage([pw, ph]);

      const echelle = Math.min(pw / largeurUtile, ph / hauteurUtile);
      const l = largeurUtile * echelle;
      const h = hauteurUtile * echelle;
      const x = (pw - l) / 2;
      const y = (ph - h) / 2;

      // `drawImage` pivote autour du coin INFÉRIEUR GAUCHE, et un angle POSITIF
      // tourne dans le sens ANTIHORAIRE (repère PDF). Or une orientation Exif 6
      // demande un quart de tour HORAIRE. D'où les angles négatifs, et l'ancrage
      // recalculé pour que l'image reste centrée une fois pivotée.
      if (rotation === 90) {
        page.drawImage(image, { x, y: y + h, width: h, height: l, rotate: degrees(-90) });
      } else if (rotation === 180) {
        page.drawImage(image, { x: x + l, y: y + h, width: l, height: h, rotate: degrees(180) });
      } else if (rotation === 270) {
        page.drawImage(image, { x: x + l, y, width: h, height: l, rotate: degrees(90) });
      } else {
        page.drawImage(image, { x, y, width: l, height: h });
      }
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
