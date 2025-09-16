// scripts/gmail_oauth_once.js
import open from "open";
import http from "http";
import { google } from "googleapis";

const clientId = process.env.GMAIL_CLIENT_ID;
const clientSecret = process.env.GMAIL_CLIENT_SECRET;
const redirectUri = "http://localhost:5556/oauth2callback";


const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
const scopes = ["https://www.googleapis.com/auth/gmail.readonly"];

const authUrl = oauth2Client.generateAuthUrl({
  access_type: "offline",
  prompt: "consent",
  scope: scopes,
});

console.log("Ouvre cette URL et connecte-toi avec offers@moneylife.ch :\n", authUrl);

const server = http.createServer(async (req, res) => {
  if (req.url.startsWith("/oauth2callback")) {
    const url = new URL(req.url, "http://localhost:5173");
    const code = url.searchParams.get("code");
    const { tokens } = await oauth2Client.getToken(code);
    console.log("\n✅ Copie ces valeurs dans .env.local :");
    console.log("GMAIL_CLIENT_ID=", clientId);
    console.log("GMAIL_CLIENT_SECRET=", clientSecret);
    console.log("GMAIL_REFRESH_TOKEN=", tokens.refresh_token);
    res.end("OK. Tu peux fermer cet onglet. Les tokens sont dans le terminal.");
    server.close();
  } else {
    res.end("OK");
  }
});

server.listen(5556, async () => {
  await open(authUrl);
});

