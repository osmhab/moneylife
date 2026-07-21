//app/admin/offres-wizard/_client/SignaturePositioner.tsx
"use client";

import React, { useState, useRef } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { Rnd } from 'react-rnd';
import { Check, X, ChevronLeft, ChevronRight, Loader2, Plus, Trash2 } from 'lucide-react';

// Indispensable pour que react-pdf fonctionne avec Next.js
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

export interface SignatureArea {
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface SignaturePositionerProps {
  pdfUrl: string;
  // 👈 MAJ : on renvoie maintenant des tableaux d'aires
  onSave: (signatureAreas: SignatureArea[], dateAreas: SignatureArea[]) => void;
  onCancel: () => void;
}

export default function SignaturePositioner({ pdfUrl, onSave, onCancel }: SignaturePositionerProps) {
  const [numPages, setNumPages] = useState<number | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [pdfScale, setPdfScale] = useState(1);
  
  // 👈 MAJ : Tableaux pour gérer plusieurs boîtes. On commence avec 1 signature et 0 date.
  const [sigBoxes, setSigBoxes] = useState([{ id: Date.now().toString(), page: 1, x: 100, y: 100, width: 200, height: 80 }]);
  const [dateBoxes, setDateBoxes] = useState<any[]>([]);

  const pageRef = useRef<HTMLDivElement>(null);

  function onDocumentLoadSuccess({ numPages }: { numPages: number }) {
    setNumPages(numPages);
  }

  // --- GESTION DES BOÎTES ---
  const addSigBox = () => setSigBoxes([...sigBoxes, { id: Date.now().toString(), page: pageNumber, x: 150, y: 150, width: 200, height: 80 }]);
  const addDateBox = () => setDateBoxes([...dateBoxes, { id: Date.now().toString(), page: pageNumber, x: 350, y: 150, width: 120, height: 30 }]);

  const removeSigBox = (id: string) => setSigBoxes(sigBoxes.filter(b => b.id !== id));
  const removeDateBox = (id: string) => setDateBoxes(dateBoxes.filter(b => b.id !== id));

  const updateSigBox = (id: string, data: any) => setSigBoxes(sigBoxes.map(b => b.id === id ? { ...b, ...data } : b));
  const updateDateBox = (id: string, data: any) => setDateBoxes(dateBoxes.map(b => b.id === id ? { ...b, ...data } : b));

  // --- CONVERSION & SAUVEGARDE ---
  const handleConfirm = () => {
    if (!pageRef.current) return;
    const renderedWidth = pageRef.current.clientWidth;
    const renderedHeight = pageRef.current.clientHeight;
    const pdfPointWidth = 595.28; 
    const pdfPointHeight = 841.89;
    const scaleX = pdfPointWidth / renderedWidth;
    const scaleY = pdfPointHeight / renderedHeight;

    const convertBox = (box: any): SignatureArea => ({
      page: box.page,
      x: Math.round(box.x * scaleX),
      y: Math.round(pdfPointHeight - ((box.y + box.height) * scaleY)),
      width: Math.round(box.width * scaleX),
      height: Math.round(box.height * scaleY),
    });

    const signatureAreasToSave = sigBoxes.map(convertBox);
    const dateAreasToSave = dateBoxes.map(convertBox);

    onSave(signatureAreasToSave, dateAreasToSave);
  };

  return (
    <div 
      className="fixed inset-0 bg-slate-900/90 z-[100] flex flex-col items-center justify-center p-4 backdrop-blur-sm pointer-events-auto"
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="bg-slate-100 rounded-3xl p-4 w-full max-w-4xl flex flex-col shadow-2xl overflow-hidden" style={{ maxHeight: '90vh' }}>
        
        {/* HEADER & OUTILS */}
        <div className="flex flex-col md:flex-row justify-between items-center mb-4 px-2 gap-4">
          <div>
            <h3 className="text-xl font-black text-slate-900">Placer les zones</h3>
            <p className="text-xs font-bold text-slate-500">Ajoutez autant de signatures et dates que nécessaire.</p>
          </div>
          
          <div className="flex gap-2 bg-white p-1 rounded-full shadow-sm">
            <button 
              type="button"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); addSigBox(); }} 
              className="px-3 py-1.5 bg-red-50 text-red-600 font-bold rounded-full text-[11px] uppercase tracking-widest hover:bg-red-100 transition-colors flex items-center gap-1"
            >
              <Plus size={14} /> Signature
            </button>
            <button 
              type="button"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); addDateBox(); }} 
              className="px-3 py-1.5 bg-blue-50 text-blue-600 font-bold rounded-full text-[11px] uppercase tracking-widest hover:bg-blue-100 transition-colors flex items-center gap-1"
            >
              <Plus size={14} /> Date Auto
            </button>
          </div>

          <div className="flex gap-2">
            <button 
              type="button"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); onCancel(); }} 
              className="px-4 py-2 bg-white text-slate-600 font-bold rounded-full text-sm hover:bg-slate-50 transition-colors"
            >
              Annuler
            </button>
            <button 
              type="button"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleConfirm(); }} 
              className="px-4 py-2 bg-black text-white font-black uppercase tracking-widest rounded-full text-sm hover:bg-slate-800 transition-colors flex items-center gap-2 shadow-lg"
            >
              <Check size={16} /> Valider
            </button>
          </div>
        </div>

        {/* NAVIGATION PAGES */}
        <div className="flex justify-center items-center gap-4 mb-4">
          <button disabled={pageNumber <= 1} onClick={() => setPageNumber(p => p - 1)} className="p-2 bg-white rounded-full disabled:opacity-50 hover:bg-slate-50 shadow-sm"><ChevronLeft size={20} /></button>
          <span className="text-sm font-black text-slate-700">Page {pageNumber} sur {numPages || '-'}</span>
          <button disabled={pageNumber >= (numPages || 1)} onClick={() => setPageNumber(p => p + 1)} className="p-2 bg-white rounded-full disabled:opacity-50 hover:bg-slate-50 shadow-sm"><ChevronRight size={20} /></button>
        </div>

        {/* ZONE PDF + DRAG & DROP MULTIPLE */}
        <div className="flex-1 overflow-auto bg-slate-300 rounded-2xl flex justify-center items-start p-8 relative shadow-inner select-none">
          <div ref={pageRef} className="relative shadow-xl">
            <Document file={pdfUrl} onLoadSuccess={onDocumentLoadSuccess} loading={<div className="p-12 text-slate-500 flex flex-col items-center"><Loader2 className="animate-spin mb-4" size={32}/> Chargement...</div>}>
              <Page pageNumber={pageNumber} scale={pdfScale} renderTextLayer={false} renderAnnotationLayer={false} className="rounded-lg overflow-hidden" />
            </Document>

            {/* Rendu dynamique des Signatures pour la page active */}
            {sigBoxes.filter(b => b.page === pageNumber).map(box => (
              <Rnd
                key={box.id} bounds="parent" position={{ x: box.x, y: box.y }} size={{ width: box.width, height: box.height }}
                onDragStop={(e, d) => updateSigBox(box.id, { x: d.x, y: d.y })}
                onResizeStop={(e, direction, ref, delta, position) => updateSigBox(box.id, { width: parseInt(ref.style.width, 10), height: parseInt(ref.style.height, 10), ...position })}
                className="border-2 border-dashed border-red-500 bg-red-500/20 flex flex-col items-center justify-center cursor-move rounded-lg group"
              >
                <span className="text-red-700 font-black text-[10px] uppercase tracking-widest bg-white/80 px-2 py-1 rounded-md pointer-events-none">Signature</span>
                <button 
                  onPointerDown={(e) => e.stopPropagation()} 
                  onMouseDown={(e) => e.stopPropagation()} 
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); removeSigBox(box.id); }} 
                  className="absolute -top-3 -right-3 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10"
                >
                  <Trash2 size={12}/>
                </button>
              </Rnd>
            ))}

            {/* Rendu dynamique des Dates pour la page active */}
            {dateBoxes.filter(b => b.page === pageNumber).map(box => (
              <Rnd
                key={box.id} bounds="parent" position={{ x: box.x, y: box.y }} size={{ width: box.width, height: box.height }}
                onDragStop={(e, d) => updateDateBox(box.id, { x: d.x, y: d.y })}
                onResizeStop={(e, direction, ref, delta, position) => updateDateBox(box.id, { width: parseInt(ref.style.width, 10), height: parseInt(ref.style.height, 10), ...position })}
                className="border-2 border-dashed border-blue-500 bg-blue-500/20 flex flex-col items-center justify-center cursor-move rounded-lg group"
              >
                <span className="text-blue-700 font-black text-[9px] uppercase tracking-widest bg-white/80 px-1.5 py-0.5 rounded-md pointer-events-none">Date Auto.</span>
                <button 
                  onPointerDown={(e) => e.stopPropagation()} 
                  onMouseDown={(e) => e.stopPropagation()} 
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); removeDateBox(box.id); }} 
                  className="absolute -top-3 -right-3 w-6 h-6 bg-blue-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10"
                >
                  <Trash2 size={12}/>
                </button>
              </Rnd>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}