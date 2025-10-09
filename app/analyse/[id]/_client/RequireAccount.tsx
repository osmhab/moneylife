// app/analyse/[id]/_client/RequireAccount.tsx
"use client";

import * as React from "react";
import { auth } from "@/lib/firebase";
import {
  onAuthStateChanged,
  signInAnonymously,
  linkWithCredential,
  EmailAuthProvider,
  linkWithPopup,
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  signInWithPopup,
} from "firebase/auth";
import { getFunctions, httpsCallable } from "firebase/functions";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";

type Props = {
  /** Appelé quand l’utilisateur est non-anonyme (accès autorisé) */
  onReady?: () => void;
  children: React.ReactNode;
};

/** Appel la Callable de migration A -> B puis pointe le client sur clients/{B} */
async function migrateIfNeeded(anonUid: string, newUid: string) {
  if (!anonUid || !newUid || anonUid === newUid) return;
  const functions = getFunctions(); // ↔ si tu as fixé une région : getFunctions(undefined, "europe-west6")
  const migrate = httpsCallable(functions, "migrateClientData");
  await migrate({ fromUid: anonUid, toUid: newUid });
  try {
    localStorage.setItem("ml_clientDocPath", `clients/${newUid}`);
  } catch {}
}

export default function RequireAccount({ onReady, children }: Props) {
  const [state, setState] = React.useState<"loading" | "anon" | "member">("loading");
  const [open, setOpen] = React.useState(false);

  // formulaire
  const [email, setEmail] = React.useState("");
  const [pwd, setPwd] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [errMsg, setErrMsg] = React.useState<string | null>(null);

  // Observateur d’auth
  React.useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) {
        // pas de session → anonyme pour obtenir un UID persistant
        await signInAnonymously(auth).catch(() => {});
        setState("anon");
        setOpen(true);
        return;
      }
      if (u.isAnonymous) {
        setState("anon");
        setOpen(true);
      } else {
        // membre : on mémorise le docPath côté client et on ouvre l’accès
        try {
          localStorage.setItem("ml_clientDocPath", `clients/${u.uid}`);
        } catch {}
        setState("member");
        setOpen(false);
        onReady?.();
      }
    });
    return () => unsub();
  }, [onReady]);

  /** Création / upgrade via Email+MDP (link → conserve UID) ; si email déjà pris → sign-in + migration */
  async function handleLinkEmail() {
    setBusy(true);
    setErrMsg(null);
    const current = auth.currentUser;
    if (!current) return;
    try {
      const cred = EmailAuthProvider.credential(email, pwd);
      await linkWithCredential(current, cred); // ✅ UID conservé
      try {
        localStorage.setItem("ml_clientDocPath", `clients/${current.uid}`);
      } catch {}
      setOpen(false);
      onReady?.();
    } catch (e: any) {
      if (e?.code === "auth/email-already-in-use") {
        try {
          const anonUid = current.uid;
          const res = await signInWithEmailAndPassword(auth, email, pwd);
          const newUid = res.user?.uid;
          await migrateIfNeeded(anonUid, newUid);
          setOpen(false);
          onReady?.();
        } catch (e2: any) {
          setErrMsg(e2?.message || "Connexion au compte existant impossible.");
        }
      } else {
        setErrMsg(e?.message || "Création du compte impossible.");
      }
    } finally {
      setBusy(false);
    }
  }

  /** Upgrade via Google (link → conserve UID) ; si déjà lié → sign-in + migration */
  async function handleLinkGoogle() {
    setBusy(true);
    setErrMsg(null);
    const current = auth.currentUser;
    if (!current) return;
    const provider = new GoogleAuthProvider();
    try {
      await linkWithPopup(current, provider); // ✅ UID conservé
      try {
        localStorage.setItem("ml_clientDocPath", `clients/${current.uid}`);
      } catch {}
      setOpen(false);
      onReady?.();
    } catch (e: any) {
      if (
        e?.code === "auth/credential-already-in-use" ||
        e?.code === "auth/account-exists-with-different-credential"
      ) {
        try {
          const anonUid = current.uid;
          const res = await signInWithPopup(auth, provider);
          const newUid = res.user?.uid;
          await migrateIfNeeded(anonUid, newUid);
          setOpen(false);
          onReady?.();
        } catch (e2: any) {
          setErrMsg(e2?.message || "Connexion Google impossible.");
        }
      } else {
        setErrMsg(e?.message || "Lien Google impossible.");
      }
    } finally {
      setBusy(false);
    }
  }

  // Si déjà membre → on rend le contenu directement
  if (state === "member") return <>{children}</>;

  return (
    <>
      {/* On montre le contenu en “gris” tant que l’accès n’est pas ouvert */}
      <div className="opacity-50 pointer-events-none">{children}</div>

      <AlertDialog open={open} onOpenChange={(o: boolean) => setOpen(o)}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Créez votre compte pour accéder aux détails</AlertDialogTitle>
            <AlertDialogDescription>
              Les informations détaillées (timeline, pièces, prestations) sont protégées.
              Créez un compte pour y accéder. Si vous avez commencé en anonyme,
              vos données seront rattachées automatiquement à votre compte.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-3">
            <div className="space-y-2">
              <Input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={busy}
              />
              <Input
                type="password"
                placeholder="Mot de passe"
                value={pwd}
                onChange={(e) => setPwd(e.target.value)}
                disabled={busy}
              />
              {errMsg ? <p className="text-sm text-red-600">{errMsg}</p> : null}
            </div>

            <div className="flex gap-2">
              <Button className="w-full" onClick={handleLinkEmail} disabled={busy || !email || !pwd}>
                {busy ? "Création…" : "Créer mon compte"}
              </Button>
              <Button className="w-full" variant="outline" onClick={handleLinkGoogle} disabled={busy}>
                Continuer avec Google
              </Button>
            </div>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Fermer</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
