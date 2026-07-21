"use client";

import React, { useState, useRef, useEffect } from "react";
import ReactCrop, { Crop, PixelCrop, centerCrop, makeAspectCrop } from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css"; // 👈 Indispensable pour l'affichage
import { Check, X, Crop as CropIcon } from "lucide-react";

interface DocumentCropperProps {
  file: File;
  onComplete: (croppedFile: File) => void;
  onCancel: () => void;
}

// Fonction utilitaire pour "découper" l'image avec un Canvas HTML
async function getCroppedImg(image: HTMLImageElement, crop: PixelCrop, fileName: string): Promise<File> {
  const canvas = document.createElement("canvas");
  const scaleX = image.naturalWidth / image.width;
  const scaleY = image.naturalHeight / image.height;
  
  // 👈 CORRECTION : On utilise la vraie résolution 4K de l'objectif, pas la taille de l'écran !
  const hdWidth = Math.floor(crop.width * scaleX);
  const hdHeight = Math.floor(crop.height * scaleY);
  
  canvas.width = hdWidth;
  canvas.height = hdHeight;
  const ctx = canvas.getContext("2d");

  if (!ctx) throw new Error("No 2d context");

  ctx.drawImage(
    image,
    crop.x * scaleX,
    crop.y * scaleY,
    crop.width * scaleX,
    crop.height * scaleY,
    0,
    0,
    hdWidth, // 👈 CORRECTION ICI AUSSI
    hdHeight // 👈 CORRECTION ICI AUSSI
  );

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Canvas is empty"));
        return;
      }
      resolve(new File([blob], fileName, { type: "image/jpeg" }));
    }, "image/jpeg", 0.95); // 0.95 pour une excellente qualité
  });
}

export default function DocumentCropper({ file, onComplete, onCancel }: DocumentCropperProps) {
  const [imgSrc, setImgSrc] = useState("");
  const imgRef = useRef<HTMLImageElement>(null);
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
  const [isProcessing, setIsProcessing] = useState(false);

  // Charger le fichier en URL pour l'afficher
  useEffect(() => {
    const objectUrl = URL.createObjectURL(file);
    setImgSrc(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  // Le client a déjà fait l'effort de viser. 
  // On sélectionne TOUTE l'image par défaut (100%).
  const onImageLoad = () => {
    setCrop({
      unit: '%',
      x: 0,
      y: 0,
      width: 100,
      height: 100
    });
  };

  const handleValidate = async () => {
    if (!imgRef.current || !completedCrop) return;
    setIsProcessing(true);
    try {
      const croppedFile = await getCroppedImg(imgRef.current, completedCrop, `cropped_${file.name}`);
      onComplete(croppedFile);
    } catch (e) {
      console.error("Erreur de recadrage", e);
      onCancel();
    }
  };

  return (
    <div className="fixed inset-0 z-[250] bg-black flex flex-col">
      {/* Header */}
      <div className="p-6 flex justify-between items-center bg-gradient-to-b from-black/80 to-transparent z-10">
        <button onClick={onCancel} className="p-3 bg-white/10 rounded-full text-white hover:bg-white/20 transition">
          <X size={24} />
        </button>
        <p className="text-white font-bold tracking-widest uppercase text-sm">Ajuster le document</p>
        <div className="w-12"></div> {/* Espaceur pour centrer le texte */}
      </div>

      {/* Zone de recadrage */}
      <div className="flex-1 overflow-hidden flex items-center justify-center p-4">
        {imgSrc && (
          <ReactCrop
            crop={crop}
            onChange={(_, percentCrop) => setCrop(percentCrop)}
            onComplete={(c) => setCompletedCrop(c)}
            className="max-h-full"
          >
            <img 
              ref={imgRef} 
              alt="Crop me" 
              src={imgSrc} 
              onLoad={onImageLoad}
              className="max-h-[70vh] w-auto object-contain"
            />
          </ReactCrop>
        )}
      </div>

      {/* Footer avec Bouton Valider */}
      <div className="p-8 pb-12 bg-gradient-to-t from-black to-black/80 flex justify-center">
        <button
          onClick={handleValidate}
          disabled={!completedCrop || isProcessing}
          className="flex items-center gap-3 bg-blue-500 text-white px-8 py-4 rounded-full font-black text-lg active:scale-95 transition-all shadow-xl shadow-blue-500/30"
        >
          {isProcessing ? (
             <span className="animate-pulse">Traitement...</span>
          ) : (
            <>
              <CropIcon size={24} />
              Valider le recadrage
            </>
          )}
        </button>
      </div>
    </div>
  );
}