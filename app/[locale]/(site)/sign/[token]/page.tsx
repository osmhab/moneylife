"use client";

import { useState, useRef, useEffect, use } from "react";
import SignatureCanvas from "react-signature-canvas";
import { Button } from "@/components/ui/button";
import { Loader2, Eraser, CheckCircle2, FileText, ArrowRight, ShieldCheck, Landmark, Pencil, AlertCircle, Check } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils"; // Assure-toi d'avoir cn, sinon utilise une string template classique

// --- UTILITAIRES IBAN ---
const formatSwissIBAN = (value: string) => {
  // 1. On ne garde que les alphanumériques et on met en majuscules
  const clean = value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  
  // 2. On force le début par CH si l'utilisateur tape autre chose ou rien
  let formatted = clean;
  if (clean.length > 0 && !clean.startsWith("C")) formatted = "CH" + clean;
  else if (clean.length > 1 && !clean.startsWith("CH")) formatted = "CH" + clean.substring(2);
  
  // 3. On limite à 21 caractères
  formatted = formatted.slice(0, 21);

  // 4. On ajoute les espaces tous les 4 caractères
  return formatted.replace(/(.{4})(?=.)/g, "$1 ");
};

const isValidSwissIBAN = (iban: string) => {
  const clean = iban.replace(/\s/g, "");
  // Doit commencer par CH et faire 21 caractères
  if (!clean.startsWith("CH") || clean.length !== 21) return false;
  
  // Validation simple par Regex (Structure Suisse)
  return /^CH\d{2}[A-Z0-9]{17}$/.test(clean);
};
// ------------------------

type RequestData = {
  details: {
    oldInstitution: string;
    contractNumber: string;
    transferDate: string;
    iban?: string;
  };
  pillarType?: "3a" | "3b";
  status: string;
};

export default function SignaturePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  
  const sigCanvas = useRef<SignatureCanvas>(null);
  const [loading, setLoading] = useState(false);
  const [dataLoading, setDataLoading] = useState(true);
  const [requestData, setRequestData] = useState<RequestData | null>(null);
  
  const [iban, setIban] = useState("");
  const [isIbanValid, setIsIbanValid] = useState(true); // État pour la validation visuelle

  const [step, setStep] = useState<"consent" | "signature">("consent");
  const [done, setDone] = useState(false);

  useEffect(() => {
    async function fetchDetails() {
      if (!token) return;
      try {
        setDataLoading(true);
        const resData = await fetch(`/api/signing/details?token=${token}`);
        if (!resData.ok) throw new Error("Document introuvable");
        const json = await resData.json();
        
        setRequestData(json);
        if (json.details?.iban) {
          const formatted = formatSwissIBAN(json.details.iban);
          setIban(formatted);
          setIsIbanValid(isValidSwissIBAN(formatted));
        }
      } catch (e) {
        toast.error("Impossible de charger les détails.");
      } finally {
        setDataLoading(false);
      }
    }
    fetchDetails();
  }, [token]);

  // Gestionnaire de changement d'input IBAN
  const handleIbanChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    const formatted = formatSwissIBAN(val);
    setIban(formatted);
    // On valide seulement si la longueur est suffisante pour éviter de crier "erreur" dès la première lettre
    setIsIbanValid(isValidSwissIBAN(formatted));
  };

  useEffect(() => {
    if (step !== "signature") return;
    const canvasElement = sigCanvas.current?.getCanvas();
    if (!canvasElement) return;
    const preventDefault = (e: TouchEvent) => { if (e.target === canvasElement) e.preventDefault(); };
    document.addEventListener("touchmove", preventDefault, { passive: false });
    return () => document.removeEventListener("touchmove", preventDefault);
  }, [step]);

  const saveSignature = async () => {
    if (sigCanvas.current?.isEmpty()) return toast.error("Veuillez signer.");
    
    // VALIDATION STRICTE AVANT ENVOI
    if (requestData?.pillarType === "3b") {
       if (!iban.trim()) return toast.error("L'IBAN est obligatoire.");
       if (!isValidSwissIBAN(iban)) return toast.error("L'IBAN saisi est invalide (CH... + 21 caractères).");
    }

    setLoading(true);
    const signatureBase64 = sigCanvas.current?.getTrimmedCanvas().toDataURL("image/png");

    try {
      const res = await fetch(`/api/signing/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          token, 
          signature: signatureBase64,
          iban: iban.replace(/\s/g, "") // On envoie l'IBAN propre sans espaces
        }),
      });
      if (!res.ok) throw new Error();
      setDone(true);
      toast.success("Signé avec succès !");
    } catch (e) {
      toast.error("Erreur lors de la signature.");
    } finally {
      setLoading(false);
    }
  };

  if (dataLoading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin text-blue-600" /></div>;

  if (done) return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center space-y-4">
      <CheckCircle2 className="h-16 w-16 text-green-500" />
      <h1 className="text-2xl font-bold">Document signé !</h1>
      <p className="text-slate-600">Votre lettre de {requestData?.pillarType === "3b" ? "résiliation" : "transfert"} a été transmise.</p>
    </div>
  );

  if (step === "consent") {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center p-4 sm:p-8">
        <div className="max-w-md w-full space-y-8 mt-10">
          <div className="text-center space-y-2">
            <div className="inline-flex items-center justify-center h-12 w-12 rounded-xl bg-blue-600 text-white shadow-lg">
              <FileText className="h-6 w-6" />
            </div>
            <h1 className="text-2xl font-bold">Vérification</h1>
            <p className="text-slate-500 text-sm">Vérifiez les informations avant de signer :</p>
          </div>

          <Card className="border-none shadow-xl rounded-3xl overflow-hidden">
            <div className="p-6 space-y-5">
              <div className="space-y-4">
                <div>
                  <p className="text-[10px] font-bold uppercase text-slate-400">Institution</p>
                  <p className="text-base font-bold">{requestData?.details.oldInstitution}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase text-slate-400">N° de contrat</p>
                  <p className="text-base font-bold">{requestData?.details.contractNumber}</p>
                </div>
                
                {requestData?.pillarType === "3b" && (
                  <div className={`p-3 rounded-xl border transition-colors ${isIbanValid ? 'bg-blue-50 border-blue-100' : 'bg-red-50 border-red-200'}`}>
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <p className={`text-[10px] font-bold uppercase ${isIbanValid ? 'text-blue-400' : 'text-red-400'}`}>
                          IBAN de rachat (3b)
                        </p>
                        {iban.length > 5 && (
                          isIbanValid ? <Check className="h-3 w-3 text-green-500" /> : <AlertCircle className="h-3 w-3 text-red-500" />
                        )}
                      </div>
                      <input 
                        type="text"
                        value={iban}
                        onChange={handleIbanChange}
                        placeholder="CH00 0000 0000 0000 0000 0"
                        maxLength={26} // 21 chars + 5 espaces max
                        className={`w-full bg-white/50 border rounded px-2 py-1 text-sm font-mono font-bold focus:outline-none focus:ring-2 
                          ${isIbanValid 
                            ? 'text-blue-900 border-blue-200 focus:ring-blue-500 placeholder:text-blue-200' 
                            : 'text-red-900 border-red-200 focus:ring-red-500 placeholder:text-red-200'
                          }`}
                      />
                      {!isIbanValid && iban.length > 0 && (
                        <p className="text-[10px] text-red-500 pt-1">Format incorrect (Attendu: CH + 19 caractères)</p>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="bg-slate-50 p-4 rounded-2xl border">
                <p className="text-xs text-slate-600 leading-relaxed italic">
                  {requestData?.pillarType === "3b" 
                    ? `En signant, vous demandez le rachat total de votre police 3b et le versement des fonds sur votre compte personnel.`
                    : `En signant, vous demandez le transfert de vos avoirs 3a de chez ${requestData?.details.oldInstitution} vers MoneyLife.`
                  }
                </p>
              </div>
            </div>
          </Card>

          <Button 
            className="w-full h-14 rounded-2xl bg-blue-600 font-bold shadow-xl disabled:opacity-50" 
            onClick={() => setStep("signature")}
            // On désactive le bouton si c'est du 3b et que l'IBAN n'est pas valide
            disabled={requestData?.pillarType === "3b" && !isIbanValid}
          >
            Confirmer et signer <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center p-4 sm:p-8">
      <div className="max-w-md w-full space-y-6">
        <Button variant="ghost" onClick={() => setStep("consent")} className="text-slate-400">← Retour</Button>
        <div className="relative border-2 border-dashed border-slate-300 rounded-3xl bg-white h-80 shadow-inner overflow-hidden">
          <SignatureCanvas ref={sigCanvas} penColor="#001D38" canvasProps={{ className: "w-full h-full" }} />
        </div>
        <div className="flex gap-3">
          <Button variant="outline" className="flex-1 h-14 rounded-2xl" onClick={() => sigCanvas.current?.clear()} disabled={loading}>Effacer</Button>
          <Button className="flex-1 h-14 rounded-2xl bg-blue-600 font-bold" onClick={saveSignature} disabled={loading}>
            {loading ? <Loader2 className="animate-spin" /> : "Terminer"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Card({ children, className }: { children: React.ReactNode, className?: string }) {
  return <div className={`bg-white border ${className}`}>{children}</div>;
}