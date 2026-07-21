// app/lib/core/signature.ts
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

export interface SignatureArea {
  page: number; // Numéro de page (1-indexed)
  x: number;     // Coordonnée X (en points PDF)
  y: number;     // Coordonnée Y (en points PDF, depuis le BAS de la page)
  width: number;
  height: number;
}

/**
 * Prend un PDF original, y incruste les images de signature et les dates,
 * et retourne les bytes du nouveau PDF signé.
 */
export async function flattenSignatureOnPdf(
  originalPdfUrl: string,
  signatureImageBase64: string, // L'image générée par le SignatureCanvas
  signatureAreas: SignatureArea[], // 👈 NOUVEAU : Tableau de zones de signature
  dateAreas?: SignatureArea[] // 👈 NOUVEAU : Tableau de zones de date
): Promise<Uint8Array> {
  // 1. Charger le PDF original depuis l'URL
  const existingPdfBytes = await fetch(originalPdfUrl).then(res => res.arrayBuffer());
  const pdfDoc = await PDFDocument.load(existingPdfBytes);
  const pages = pdfDoc.getPages();

  // 2. Charger l'image de la signature (une seule fois pour les performances)
  const signatureImage = await pdfDoc.embedPng(signatureImageBase64);
  const imgWidth = signatureImage.width;
  const imgHeight = signatureImage.height;

  // 3. BOUCLE : Dessiner toutes les signatures
  for (const area of signatureAreas) {
    // Vérification de sécurité au cas où une boîte pointerait vers une page supprimée
    if (area.page < 1 || area.page > pages.length) continue;
    
    const page = pages[area.page - 1];

    // --- CALCUL DU RATIO SIGNATURE (Style "object-fit: contain") ---
    const scaleX = area.width / imgWidth;
    const scaleY = area.height / imgHeight;
    const scale = Math.min(scaleX, scaleY);

    const drawWidth = imgWidth * scale;
    const drawHeight = imgHeight * scale;

    const offsetX = (area.width - drawWidth) / 2;
    const offsetY = (area.height - drawHeight) / 2;

    // Dessiner l'image à l'emplacement exact et parfaitement centrée
    page.drawImage(signatureImage, {
      x: area.x + offsetX,
      y: area.y + offsetY,
      width: drawWidth,
      height: drawHeight,
    });
  }

  // 4. BOUCLE : DESSINER TOUTES LES DATES SI FOURNIES
  if (dateAreas && dateAreas.length > 0) {
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    
    // Récupération de la date du jour au format suisse (ex: 06.04.2026)
    const today = new Date();
    const dateString = today.toLocaleDateString('fr-CH', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    }); 

    for (const dateArea of dateAreas) {
      if (dateArea.page < 1 || dateArea.page > pages.length) continue;
      
      const datePage = pages[dateArea.page - 1];

      // On dessine le texte en le centrant verticalement dans la boîte bleue
      datePage.drawText(dateString, {
        x: dateArea.x,
        y: dateArea.y + (dateArea.height / 2) - 3, // -3 pour un rendu visuel parfaitement centré
        size: 10,
        font: font,
        color: rgb(0, 0, 0),
      });
    }
  }

  // 5. Enregistrer le nouveau PDF (bytes)
  const pdfBytes = await pdfDoc.save();
  return pdfBytes;
}