// app/(auth)/login/page.tsx
import React from "react";
import LoginForm from "./_client/LoginForm";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const nextRaw = sp.next;
  const nextParam = (Array.isArray(nextRaw) ? nextRaw[0] : nextRaw) ?? null;


  const signupHref = nextParam
    ? `/signup?next=${encodeURIComponent(nextParam)}`
    : "/signup";

  return <LoginForm nextParam={nextParam} signupHref={signupHref} />;
}
