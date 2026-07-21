// app/admin/clients/[uid]/_client/TransferToolDialog.tsx
"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Mail, Download, Loader2, FileText, User, Landmark } from "lucide-react";
import { toast } from "sonner";
import { auth } from "@/lib/firebase";


const formatSwissIBAN = (value: string) => {
    const clean = value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
    let formatted = clean;
    if (clean.length > 0 && !clean.startsWith("C")) formatted = "CH" + clean;
    else if (clean.length > 1 && !clean.startsWith("CH")) formatted = "CH" + clean.substring(2);
    formatted = formatted.slice(0, 21);
    return formatted.replace(/(.{4})(?=.)/g, "$1 ");
  };


interface TransferToolDialogProps {
  client: {
    uid: string;
    firstName?: string;
    lastName?: string;
    address?: string; 
    npa?: string;
    localite?: string;
    iban?: string;
  };
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TransferToolDialog({ client, open, onOpenChange }: TransferToolDialogProps) {
  const [loading, setLoading] = useState(false);
  const [pillarType, setPillarType] = useState<"3a" | "3b">("3a");
  
  const [data, setData] = useState({
    oldInstitution: "",
    oldAddress: "",
    contractNumber: "",
    transferDate: "01.03.2026",
    clientAddress: "",
    clientNPA: "",
    clientCity: "",
    iban: "",
  });

  useEffect(() => {
    if (open && client) {
      setData(prev => ({
        ...prev,
        clientAddress: client.address || "",
        clientNPA: client.npa || "",
        clientCity: client.localite || "",
        iban: client.iban || "",
      }));
    }
  }, [open, client]);

  const handleAction = async (sendEmail: boolean) => {
    if (!data.oldInstitution || !data.contractNumber) {
      toast.error("Veuillez remplir l'institution et le n° de contrat.");
      return;
    }

    // --- MODIFICATION ICI : On a supprimé la vérification stricte de l'IBAN ---
    // Si l'admin laisse vide, c'est le client qui devra le remplir sur son mobile.
    
    setLoading(true);
    try {
      const user = auth.currentUser;
      if (!user) throw new Error("Non authentifié");
      const token = await user.getIdToken();

      const endpoint = pillarType === "3a" 
        ? "/api/admin/clients/transfer-letter" 
        : "/api/admin/clients/termination-3b";

      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ 
          ...data, 
          // Si l'IBAN est vide, on envoie une chaîne vide, l'API le gèrera très bien
          clientUid: client.uid, 
          pillarType,
          sendEmail 
        }),
      });

      if (!res.ok) throw new Error("Erreur lors de la génération");

      if (sendEmail) {
        toast.success("Lien envoyé au client !");
        onOpenChange(false);
      } else {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        const fileName = pillarType === "3a" ? "Transfert_3a" : "Resiliation_3b";
        a.download = `${fileName}_${client.lastName || "client"}.pdf`;
        a.click();
        toast.success("PDF généré");
      }
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px] max-h-[95vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <FileText className="h-5 w-5 text-blue-600" />
            Gestion des résiliations
          </DialogTitle>
          <DialogDescription>
            Choisissez le type de pilier et complétez les informations pour {client.firstName}.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="3a" className="w-full mt-2" onValueChange={(v) => setPillarType(v as "3a" | "3b")}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="3a">3ème Pilier A</TabsTrigger>
            <TabsTrigger value="3b">3ème Pilier B</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="space-y-4 py-4">
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase">
              <User className="h-3 w-3" /> Coordonnées de l'assuré
            </div>
            <Input
              placeholder="Rue et numéro"
              value={data.clientAddress}
              onChange={(e) => setData({ ...data, clientAddress: e.target.value })}
            />
            <div className="grid grid-cols-3 gap-2">
              <Input
                placeholder="NPA"
                value={data.clientNPA}
                onChange={(e) => setData({ ...data, clientNPA: e.target.value })}
              />
              <div className="col-span-2">
                <Input
                  placeholder="Localité"
                  value={data.clientCity}
                  onChange={(e) => setData({ ...data, clientCity: e.target.value })}
                />
              </div>
            </div>
          </div>

          {pillarType === "3b" && (
            <div className="p-3 bg-blue-50/50 rounded-xl border border-blue-100 space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-blue-600 uppercase">
                <div className="flex items-center gap-2">
                  <Landmark className="h-3 w-3" /> IBAN de versement
                </div>
                <span className="text-[10px] bg-blue-100 px-2 py-0.5 rounded text-blue-700">Optionnel</span>
              </div>
              <Input
                placeholder="CH00 0000 0000 0000 0000 0"
                value={data.iban}
                onChange={(e) => {
                  // On formate à la volée
                  const formatted = formatSwissIBAN(e.target.value);
                  setData({ ...data, iban: formatted });
                }}
                maxLength={26}
                className="bg-white font-mono"
              />
              <p className="text-[10px] text-blue-500 italic">
                Si vous ne le connaissez pas, laissez vide : le client devra le saisir lui-même pour signer.
              </p>
            </div>
          )}

          <div className="space-y-3">
            <div className="text-xs font-bold text-slate-500 uppercase">Institution à résilier</div>
            <Input
              placeholder="Nom (ex: Swiss Life, Retraites Populaires...)"
              value={data.oldInstitution}
              onChange={(e) => setData({ ...data, oldInstitution: e.target.value })}
            />
            <Textarea
              placeholder="Adresse du siège ou de l'agence..."
              className="min-h-[80px]"
              value={data.oldAddress}
              onChange={(e) => setData({ ...data, oldAddress: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase text-slate-500">N° de Police</Label>
              <Input
                placeholder="Ex: 12.345.678"
                value={data.contractNumber}
                onChange={(e) => setData({ ...data, contractNumber: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase text-slate-500">Date d'effet</Label>
              <Input
                value={data.transferDate}
                onChange={(e) => setData({ ...data, transferDate: e.target.value })}
              />
            </div>
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={() => handleAction(false)} disabled={loading} className="w-full sm:w-auto">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4 mr-2" />} 
            Aperçu PDF
          </Button>
          <Button onClick={() => handleAction(true)} disabled={loading} className="bg-blue-600 w-full sm:w-auto">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4 mr-2" />} 
            Envoyer pour signature
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}