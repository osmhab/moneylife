//app/api/send-offer/route.ts
import { NextResponse } from "next/server";
import sgMail from "@sendgrid/mail";
import { requireInternal } from "@/lib/server/requireInternal";

// Configuration SendGrid
sgMail.setApiKey(process.env.SENDGRID_API_KEY as string);

export async function POST(req: Request) {
  // ⚠️ La plus sensible des routes d'e-mail : elle accepte `offerLink`,
  // `compagnie`, `capital` et `prime`. Sans authentification, n'importe qui
  // composait un « votre offre 3e pilier est prête » avec le lien de son choix,
  // expédié depuis un domaine authentifié SendGrid — un hameçonnage à l'en-tête
  // authentique, sur un produit financier, contre vos propres clients.
  try {
    await requireInternal(req);
  } catch (e: any) {
    const status = e?.message === "FORBIDDEN" ? 403 : 401;
    return NextResponse.json({ error: "Accès réservé aux collaborateurs" }, { status });
  }

  try {
    const body = await req.json();
    const { email, firstName, lastName, offerLink, compagnie, capital, prime } = body;

    if (!email || !offerLink) {
      return NextResponse.json({ error: "Données manquantes" }, { status: 400 });
    }

    // URL de base pour les images (En prod, c'est ton domaine. En local, l'image ne s'affichera pas dans l'email reçu)
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://moneylife.ch";
    const logoUrl = `${baseUrl}/LogoMoneyLife.svg`;

    // Template HTML "MoneyLife Premium"
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Votre offre MoneyLife</title>
        <style>
          body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 0; }
          .container { max-width: 600px; margin: 40px auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); }
          .header { background-color: #ffffff; padding: 30px; text-align: center; border-bottom: 1px solid #e2e8f0; }
          .logo { height: 36px; width: auto; display: block; margin: 0 auto; }
          .content { padding: 40px 30px; color: #334155; line-height: 1.6; }
          .h1 { color: #0f172a; font-size: 24px; font-weight: 800; margin-bottom: 20px; }
          .card { background-color: #f1f5f9; border-radius: 12px; padding: 20px; margin: 24px 0; border: 1px solid #e2e8f0; }
          .card-row { display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 14px; }
          .card-label { color: #64748b; font-weight: 600; text-transform: uppercase; font-size: 11px; letter-spacing: 0.05em; }
          .card-value { color: #0f172a; font-weight: 700; }
          .btn-container { text-align: center; margin-top: 32px; margin-bottom: 10px; }
          .btn { background-color: #2563EB; color: #ffffff !important; padding: 16px 32px; border-radius: 50px; text-decoration: none; font-weight: 700; font-size: 16px; display: inline-block; box-shadow: 0 4px 12px rgba(37, 99, 235, 0.3); }
          .footer { background-color: #0f172a; color: #94a3b8; padding: 30px; text-align: center; font-size: 12px; }
          .footer a { color: #cbd5e1; text-decoration: none; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <img src="${logoUrl}" alt="MoneyLife" class="logo" />
          </div>
          
          <div class="content">
            <div class="h1">Bonjour ${firstName},</div>
            <p>Suite à votre demande, nous avons le plaisir de vous transmettre votre offre de prévoyance optimisée.</p>
            <p>Nous avons sélectionné pour vous la solution <strong>${compagnie}</strong> qui répond parfaitement à vos objectifs de rendement et de sécurité.</p>
            
            <div class="card">
              <div class="card-row">
                <span class="card-label">Compagnie</span>
                <span class="card-value">${compagnie}</span>
              </div>
              <div class="card-row">
                <span class="card-label">Capital estimé</span>
                <span class="card-value" style="color: #059669;">${capital} CHF</span>
              </div>
              <div style="border-top: 1px solid #cbd5e1; margin: 10px 0;"></div>
              <div class="card-row">
                <span class="card-label">Prime mensuelle</span>
                <span class="card-value">${prime} CHF</span>
              </div>
            </div>

            <p>Vous trouverez le détail complet et le document officiel en cliquant ci-dessous :</p>
            
            <div class="btn-container">
              <a href="${offerLink}" class="btn">Consulter mon offre</a>
            </div>
            
            <p style="font-size: 13px; color: #64748b; margin-top: 30px;">
              Si vous avez des questions, nous restons disponibles directement par réponse à cet email.
            </p>
          </div>

          <div class="footer">
            <p><strong>CreditX Sàrl - Exploitant Creditx.ch</strong><br>Place de l'Aubade 3, 1950 Sion</p>
            <p>Agréé FINMA n°F01536084</p>
            <p style="margin-top: 20px; opacity: 0.5;">© ${new Date().getFullYear()} CreditX Sàrl. Tous droits réservés.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const msg = {
      to: email,
      from: {
        email: 'info@moneylife.ch',
        name: 'MoneyLife'
      },
      subject: `Votre offre de prévoyance ${compagnie} est prête`,
      text: `Bonjour ${firstName}, votre offre ${compagnie} est disponible ici : ${offerLink}`,
      html: htmlContent,
    };

    await sgMail.send(msg);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Erreur SendGrid:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}