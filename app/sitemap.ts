import type { MetadataRoute } from "next";

const baseUrl = "https://creditx.ch";

const locales = ["fr", "de"];

const publicRoutes = [
  "",
  "/3a-simulator",
  "/contact",
  "/presentation",
  "/prevoyance/3e-pilier",
  "/legal",
  "/legal/cgu",
  "/legal/confidentialite",
  "/legal/cookies",
  "/prevoyance/diagnostic",
  "/pricing",
  "/rappel",
];

export default function sitemap(): MetadataRoute.Sitemap {
  return locales.flatMap((locale) =>
    publicRoutes.map((route) => ({
      url: `${baseUrl}/${locale}${route}`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: route === "" ? 1 : 0.8,
    }))
  );
}