//tailwind.config.js
/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: "#003263",
        success: "#4fd1c5",
        warning: "#F59E0B",
      },

      // ✅ Gradient réutilisable (bg-ml-rainbow)
      backgroundImage: {
        "ml-rainbow":
          "linear-gradient(90deg,#ff004c,#ff7a00,#ffd500,#00d084,#00b3ff,#6a00ff,#ff00c8)",
      },

      // ✅ Google++: 2 barres décalées, vitesses différentes
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
    },
  },
  plugins: [require("tailwindcss-animate")],
};