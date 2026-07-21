// app/api/scoring/3epilier/route.ts
import { NextResponse } from "next/server";
import { db } from "@/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";
import { sendVerdictEmail } from "lib/email/sendVerdictEmail";

type Verdict = "green" | "orange" | "red";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { age, incomeRange, has3a, email } = body;

    // --- VALIDATION MINIMALE ---
    if (typeof age !== "number" || !Number.isFinite(age) || age <= 0 || age > 120) {
      return NextResponse.json({ error: "Invalid age" }, { status: 400 });
    }
    if (typeof incomeRange !== "string" || !incomeRange) {
      return NextResponse.json({ error: "Invalid incomeRange" }, { status: 400 });
    }
    if (has3a !== "yes" && has3a !== "no" && has3a !== "unknown") {
      return NextResponse.json({ error: "Invalid has3a" }, { status: 400 });
    }

    // email optionnel
    const emailStr = typeof email === "string" ? email.trim() : "";
    const hasEmail = emailStr.length > 0;

    if (hasEmail && !emailStr.includes("@")) {
      return NextResponse.json({ error: "Invalid email" }, { status: 400 });
    }

    // --- AGE ---
    let ageScore = 0;
    if (age < 25) ageScore = 5;
    else if (age < 30) ageScore = 10;
    else if (age < 40) ageScore = 20;
    else if (age < 50) ageScore = 25;
    else ageScore = 30;

    // --- REVENU ---
    let incomeScore = 0;
    switch (incomeRange) {
      case "<50k":
        incomeScore = 5;
        break;
      case "50-80k":
        incomeScore = 10;
        break;
      case "80-120k":
        incomeScore = 20;
        break;
      default:
        incomeScore = 30;
    }

    // --- 3E PILIER ---
    let pillarScore = 0;
    if (has3a === "yes") pillarScore = 15;
    else if (has3a === "unknown") pillarScore = 30;
    else pillarScore = 40;

    const score = ageScore + incomeScore + pillarScore;

    let verdict: Verdict = "green";
    if (score >= 65) verdict = "red";
    else if (score >= 35) verdict = "orange";

    // --- FIRESTORE ---
    const ref = await db.collection("verifications_3epilier").add({
      age,
      incomeRange,
      has3a,
      email: hasEmail ? emailStr : null,
      score,
      verdict,
      source: "landing_verifier_3epilier",
      createdAt: Timestamp.now(),
    });

    // --- EMAIL (uniquement si email fourni) ---
    if (hasEmail) {
      sendVerdictEmail({
        email: emailStr,
        verdict,
        verificationId: ref.id,
      }).catch((err) => {
        console.error("[sendVerdictEmail] failed:", err);
      });
    }

    return NextResponse.json({ verdict, verificationId: ref.id });
  } catch (err) {
    console.error("[scoring/3epilier] error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}