// app/api/send-offer-confirmation/route.ts
import { NextResponse } from 'next/server';
import { sendCreditXConfirmationEmail, sendCreditXAdminAlert } from 'lib/mail/creditx-mailer';

export async function POST(request: Request) {   
  try {
    const body = await request.json();
    
    // Extraction de toutes les données envoyées par le Wizard
    const { 
      email, 
      firstName, 
      lastName, 
      phone, 
      profession, 
      address, 
      recommendation, 
      monthlyTotal, 
      requestId, 
      riskProfile,
      sante,      // L'objet avec isSmoker, height, weight, healthOk
      benchmarks,
      details // L'objet avec deces, ia, lf, company
    } = body;

    // 1. Envoi de l'email de confirmation au Client
    await sendCreditXConfirmationEmail({
      to: email,
      firstName,
      recommendation,
      monthlyTotal,
      details // 👈 AJOUT ICI : On transmet les détails pour construire le tableau des garanties !
    });

    // 2. Envoi de l'alerte détaillée à l'Admin CreditX (info@creditx.ch)
    await sendCreditXAdminAlert({
      client: { 
        firstName, 
        lastName, 
        phone, 
        profession, 
        address, 
        email 
      },
      selection: { 
        recommendation, 
        total: monthlyTotal, 
        riskProfile,
        details
      },
      sante,      // Transmis au mailer pour les blocs orange
      benchmarks, // Transmis au mailer pour le tableau des gagnants
      requestId
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Erreur API Email CreditX:", error);
    return NextResponse.json(
      { error: "Erreur lors de l'envoi des emails transactionnels" }, 
      { status: 500 }
    );
  }
}