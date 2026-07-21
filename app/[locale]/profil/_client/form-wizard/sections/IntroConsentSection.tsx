"use client";

import React from "react";
import type { UseFormReturn } from "react-hook-form";
import type { MinimalForm } from "../sections.registry";

export default function IntroConsentSection({
  form,
}: {
  form: UseFormReturn<MinimalForm>;
}) {
  return (
    <div className="relative w-full h-full flex flex-col bg-white overflow-hidden select-none">

      {/* --------- TEXTE HAUT --------- */}
      <div className="flex-1 flex flex-col items-center justify-start text-center px-6 pt-16 sm:pt-20">
        <h1 className="text-2xl sm:text-3xl font-semibold text-[#001D38] mb-4">
          Données personnelles
        </h1>

        <p className="text-sm sm:text-base text-[#001D38]/80 leading-relaxed max-w-md">
          Afin de réaliser votre analyse de prévoyance, vous devez répondre à
          quelques questions. Vos données sont traitées de manière strictement
          confidentielle et ne sont utilisées que dans le cadre de votre
          analyse.
        </p>
      </div>

      {/* --------- ICÔNE PERSONNAGE (SVG exact fourni) --------- */}
      <div
  className="
    absolute z-10 pointer-events-none
    bottom-[18%]         /* mobile = plus haut */
    sm:bottom-[16%]      /* desktop = parfait, on garde */
    left-[10%] sm:left-[16%]
  "
>
  <svg
    width="73px"
    height="92px"
    viewBox="0 0 73 92"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
    className="w-[75px] h-[95px] sm:w-[105px] sm:h-[135px]"
  >
    <g fill="#001D38" fillRule="evenodd">
      <path
        d="M127.121379,451.499396 C139.41703,451.499396 149.384625,441.531801 149.384625,429.23615 C149.384625,416.940498 139.41703,406.972904 127.121379,406.972904 C114.825728,406.972904 104.858133,416.940498 104.858133,429.23615 C104.858133,441.531801 114.825728,451.499396 127.121379,451.499396 Z M127.121379,455.279396 C157.294618,455.279396 168.564419,469.217876 160.930781,497.094838 L93.3119771,497.094838 C85.6783396,469.217876 96.9481402,455.279396 127.121379,455.279396 Z"
        transform="translate(-91 -406)"
      />
    </g>
  </svg>
</div>

      {/* --------- VAGUES ANIMÉES --------- */}
      <div className="absolute bottom-0 left-0 right-0 z-20 pointer-events-none">
        <svg
          viewBox="0 0 420 326"
          className="w-full h-[38vh] min-h-[200px] max-h-[330px]"
          preserveAspectRatio="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            {/* Dégradé animé (couleurs + déplacement) */}
            <linearGradient id="intro-vague-gradient" x1="38%" y1="36%" x2="102%" y2="82%">
              <stop offset="0%" stopColor="#FCBB88">
                <animate
                  attributeName="stop-color"
                  values="#FCBB88; #FFD0A8; #FCBB88"
                  dur="9s"
                  repeatCount="indefinite"
                />
              </stop>
              <stop offset="100%" stopColor="#E90059">
                <animate
                  attributeName="stop-color"
                  values="#E90059; #FF2E80; #E90059"
                  dur="9s"
                  repeatCount="indefinite"
                />
              </stop>

              {/* Déplacement du gradient */}
              <animate
                attributeName="x1"
                values="38%; 10%; 38%"
                dur="12s"
                repeatCount="indefinite"
              />
              <animate
                attributeName="x2"
                values="102%; 130%; 102%"
                dur="12s"
                repeatCount="indefinite"
              />
              <animate
                attributeName="y1"
                values="36%; 10%; 36%"
                dur="12s"
                repeatCount="indefinite"
              />
              <animate
                attributeName="y2"
                values="82%; 110%; 82%"
                dur="12s"
                repeatCount="indefinite"
              />
            </linearGradient>
          </defs>

          <g transform="translate(0, -314)" fill="url(#intro-vague-gradient)">

            {/* --------- VAGUE ARRIÈRE (plus douce) --------- */}
            <path
              opacity="0.6"
              d="
                M0,495
                C80,520 160,500 235,430
                C310,360 365,330 420,325
                L420,640
                L0,640
                Z
              "
            >
              <animate
                attributeName="d"
                dur="12s"
                repeatCount="indefinite"
                values="
                  M0,495 C80,520 160,500 235,430 C310,360 365,330 420,325 L420,640 L0,640 Z;
                  M0,485 C80,510 160,490 235,420 C310,350 365,320 420,315 L420,640 L0,640 Z;
                  M0,495 C80,520 160,500 235,430 C310,360 365,330 420,325 L420,640 L0,640 Z;
                "
              />
            </path>

            {/* --------- VAGUE AVANT (plus nette) --------- */}
            <path
              opacity="0.95"
              d="
                M0,483.6
                C80.3,506.6 157.0,485.1 230.1,419.1
                C303.2,353.0 366.5,318.2 420,314.7
                L420,640
                L0,640
                Z
              "
            >
              <animate
                attributeName="d"
                dur="10s"
                repeatCount="indefinite"
                values="
                  M0,483.6 C80.3,506.6 157.0,485.1 230.1,419.1 C303.2,353.0 366.5,318.2 420,314.7 L420,640 L0,640 Z;
                  M0,490.0 C80.3,513.0 157.0,493.0 230.1,425.0 C303.2,357.0 366.5,323.0 420,320.0 L420,640 L0,640 Z;
                  M0,483.6 C80.3,506.6 157.0,485.1 230.1,419.1 C303.2,353.0 366.5,318.2 420,314.7 L420,640 L0,640 Z;
                "
              />
            </path>

          </g>
        </svg>
      </div>
    </div>
  );
}