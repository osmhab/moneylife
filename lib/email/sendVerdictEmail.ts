import sgMail from "@sendgrid/mail";

sgMail.setApiKey(process.env.SENDGRID_API_KEY!);

type Verdict = "green" | "orange" | "red";

export async function sendVerdictEmail({
  email,
  verdict,
  verificationId,
}: {
  email: string;
  verdict: Verdict;
  verificationId: string;
}) {
  const baseUrl = "https://moneylife.ch/verifier-3e-pilier/comprendre";
  const vid = encodeURIComponent(verificationId);

  const meta = {
    green: {
      subject: "Votre 3e pilier semble cohérent",
      label: "Situation cohérente",
      hint: "Rien n’indique un problème évident à ce stade.",
      cta: "Voir le détail",
      toneBg: "#EAF8F5",
      toneText: "#0F766E",
    },
    orange: {
      subject: "Un point mérite votre attention",
      label: "Risque potentiel",
      hint: "Dans votre situation, un point mérite d’être compris.",
      cta: "Comprendre ce point",
      toneBg: "#FFF7ED",
      toneText: "#92400E",
    },
    red: {
      subject: "Votre situation mérite une attention particulière",
      label: "Alerte",
      hint: "Votre profil correspond à un cas où l’impact peut être important à long terme.",
      cta: "Voir ce qui peut être amélioré",
      toneBg: "#FEF2F2",
      toneText: "#991B1B",
    },
  } as const;

  const t = meta[verdict];
  const link = `${baseUrl}?verdict=${verdict}&vid=${vid}&src=email`;

  // Email HTML (tables + inline styles = compat)
  const html = `
  <div style="margin:0;padding:0;background:#F6F7F9;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#F6F7F9;padding:24px 0;">
      <tr>
        <td align="center" style="padding:0 12px;">
          <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;">
            
            <!-- Header -->
            <tr>
              <td style="padding:8px 8px 14px 8px;">
                <div style="font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#111827;font-weight:700;font-size:18px;line-height:1.2;">
                  MoneyLife
                </div>
                <div style="font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#6B7280;font-size:13px;line-height:1.4;margin-top:4px;">
                  Résultat de votre vérification
                </div>
              </td>
            </tr>

            <!-- Main card -->
            <tr>
              <td style="background:#FFFFFF;border-radius:24px;padding:22px 22px 18px 22px;box-shadow:0 1px 2px rgba(0,0,0,0.05);">
                
                <!-- Badge -->
                <div style="display:inline-block;background:${t.toneBg};color:${t.toneText};border-radius:999px;padding:6px 10px;font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;font-size:12px;font-weight:600;">
                  ${t.label}
                </div>

                <!-- Title -->
                <div style="margin-top:14px;font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#111827;font-size:20px;font-weight:700;line-height:1.25;">
                  ${t.subject}
                </div>

                <!-- Hint -->
                <div style="margin-top:10px;font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#374151;font-size:14px;line-height:1.6;">
                  ${t.hint}
                </div>

                <!-- CTA -->
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin-top:16px;">
                  <tr>
                    <td align="center" bgcolor="#4FD1C5" style="border-radius:14px;">
                      <a href="${link}" target="_blank"
                        style="display:inline-block;padding:12px 18px;font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;
                               font-size:14px;font-weight:700;color:#0B1220;text-decoration:none;">
                        ${t.cta}
                      </a>
                    </td>
                  </tr>
                </table>

                <!-- What next -->
                <div style="margin-top:18px;border-top:1px solid #EEF2F7;padding-top:14px;">
                  <div style="font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#111827;font-size:13px;font-weight:700;">
                    À quoi vous attendre
                  </div>

                  <div style="margin-top:8px;font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#4B5563;font-size:13px;line-height:1.6;">
                    • Un détail clair sur le point détecté<br/>
                    • Une explication simple (sans jargon)<br/>
                    • Vous restez libre de ne rien changer
                  </div>
                </div>

              </td>
            </tr>

            <!-- Footer -->
            <tr>
              <td style="padding:14px 8px 0 8px;">
                <div style="font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#6B7280;font-size:12px;line-height:1.6;text-align:left;">
                  Vous recevez cet email car vous avez demandé une vérification sur MoneyLife.<br/>
                  <span style="color:#9CA3AF;">Données traitées de manière confidentielle.</span>
                </div>

                <div style="margin-top:10px;font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;font-size:12px;color:#6B7280;">
                  <a href="https://moneylife.ch/legal/confidentialite" target="_blank" style="color:#6B7280;text-decoration:underline;">Politique de confidentialité</a>
                  &nbsp;·&nbsp;
                  <a href="https://moneylife.ch/legal" target="_blank" style="color:#6B7280;text-decoration:underline;">Mentions légales</a>
                </div>

                <div style="margin-top:12px;font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#6B7280;font-size:12px;">
                  MoneyLife
                </div>
              </td>
            </tr>

          </table>
        </td>
      </tr>
    </table>
  </div>
  `;

  await sgMail.send({
    to: email,
    from: "MoneyLife <hello@moneylife.ch>",
    subject: t.subject,
    html,
  });
}