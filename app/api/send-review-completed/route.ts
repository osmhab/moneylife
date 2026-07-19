import { NextResponse } from 'next/server';
import { sendCreditXReviewCompletedEmail } from 'lib/mail/creditx-mailer';

export async function POST(request: Request) {
  try {
    const body = await request.json();

    // 👈 NOUVEAU : ajout de locale
    const { email, firstName, institutionName, planType, locale } = body;

    const isLPP = planType === "LPP_BASE" || planType === "LPP_COMPL" || !planType;
    const typeLabel = isLPP ? "certificat LPP" : "contrat 3ème pilier";

    await sendCreditXReviewCompletedEmail({
      to: email,
      firstName: firstName || "Client",
      institutionName: institutionName || "Institution",
      typeLabel,
      locale // 👈 NOUVEAU
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Erreur API Email Review Completed:", error);
    return NextResponse.json(
      { error: "Erreur lors de l'envoi de l'email de certification" }, 
      { status: 500 }
    );
  }
}