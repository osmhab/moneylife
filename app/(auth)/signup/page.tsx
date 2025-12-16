// app/(auth)/signup/page.tsx
import React from "react";
import SignupForm from "./_client/SignupForm";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const nextParamRaw = sp.next;
  const nextParam =
    (Array.isArray(nextParamRaw) ? nextParamRaw[0] : nextParamRaw) ?? null;

  const loginHref = nextParam
    ? `/login?next=${encodeURIComponent(nextParam)}`
    : "/login";

  return <SignupForm nextParam={nextParam} loginHref={loginHref} />;
}
