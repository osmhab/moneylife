//app/[locale]/(auth)/signup/page.tsx
import React from "react";
import SignupForm from "./_client/SignupForm";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const nextParamRaw = sp.next;
  const nextParam = (Array.isArray(nextParamRaw) ? nextParamRaw[0] : nextParamRaw) ?? null;

  // 👈 NOUVEAU : On capte le paramètre "ref"
  const refParamRaw = sp.ref;
  const refParam = (Array.isArray(refParamRaw) ? refParamRaw[0] : refParamRaw) ?? null;

  // On transmet aussi le ref au bouton "Se connecter" au cas où il a déjà un compte
  const loginHref = nextParam
    ? `/login?next=${encodeURIComponent(nextParam)}${refParam ? `&ref=${refParam}` : ''}`
    : `/login${refParam ? `?ref=${refParam}` : ''}`;

  return <SignupForm nextParam={nextParam} loginHref={loginHref} refParam={refParam} />;
}
