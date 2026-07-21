/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      // ✅ Configuration Police Inter
      fontFamily: {
        sans: ["var(--font-inter)", "Inter", "sans-serif"],
      },
      
      colors: {
        // Palette Revolut Style
        primary: "#191C1F", // Noir profond pour les textes et boutons principaux
        blue: {
          500: "#0075FF", // Le bleu d'accentuation fintech
        },
        slate: {
          50: "#F8F9FB",
          100: "#F1F2F4",
          200: "#E2E4E8",
          900: "#191C1F",
        },
        success: "#00D084", // Vert Revolut plus vibrant
        warning: "#F59E0B",
        error: "#FF4D4D",
      },

      // ✅ Arrondis typiques App Mobile
      borderRadius: {
        "2xl": "1.25rem",
        "3xl": "2rem",
        "4xl": "2.5rem",
      },

      // ✅ Gradient réutilisable (bg-ml-rainbow)
      backgroundImage: {
        "ml-rainbow":
          "linear-gradient(90deg,#ff004c,#ff7a00,#ffd500,#00d084,#00b3ff,#6a00ff,#ff00c8)",
      },

      // ✅ Keyframes pour tes animations de scan
      keyframes: {
        "ml-rainbow-fast": {
          "0%": { transform: "translateX(-120%)" },
          "100%": { transform: "translateX(320%)" },
        },
        "ml-rainbow-slow": {
          "0%": { transform: "translateX(-180%)" },
          "100%": { transform: "translateX(260%)" },
        },
      },
      animation: {
        "ml-rainbow-fast": "ml-rainbow-fast 0.85s linear infinite",
        "ml-rainbow-slow": "ml-rainbow-slow 1.3s linear infinite",
      },
      
      // ✅ Ombres très douces pour les cartes
      boxShadow: {
        'fintech': '0 8px 30px rgba(0, 0, 0, 0.04)',
        'fintech-hover': '0 20px 40px rgba(0, 0, 0, 0.08)',
      }
    },
  },
  plugins: [require("tailwindcss-animate")],
};