"use client";

import React, { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { ArrowRight, Zap } from "lucide-react";
import { useTranslations } from "next-intl";

export default function AetherHero() {
  const t = useTranslations("ThirdPillar");
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // --- MOTEUR DE PARTICULES INTERACTIF ---
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let particles: Particle[] = [];
    let animationFrameId: number;

    // 👈 NOUVEAU : On traque la position de la souris
    let mouse = {
      x: -1000, // Hors de l'écran par défaut
      y: -1000,
      radius: 180 // Rayon d'interaction de la souris
    };

    const handleMouseMove = (e: MouseEvent) => {
      mouse.x = e.clientX;
      mouse.y = e.clientY;
    };

    const handleMouseOut = () => {
      mouse.x = -1000;
      mouse.y = -1000;
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseout", handleMouseOut);

    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      initParticles();
    };

    class Particle {
      x: number;
      y: number;
      vx: number;
      vy: number;
      radius: number;
      baseX: number;
      baseY: number;

      constructor() {
        this.x = Math.random() * canvas!.width;
        this.y = Math.random() * canvas!.height;
        this.baseX = this.x;
        this.baseY = this.y;
        this.vx = (Math.random() - 0.5) * 0.8; 
        this.vy = (Math.random() - 0.5) * 0.8;
        this.radius = Math.random() * 1.5 + 0.5;
      }

      update() {
        // Mouvement naturel
        this.x += this.vx;
        this.y += this.vy;

        // Rebond sur les bords
        if (this.x < 0 || this.x > canvas!.width) this.vx *= -1;
        if (this.y < 0 || this.y > canvas!.height) this.vy *= -1;

        // 👈 NOUVEAU : Interaction (Répulsion très légère avec la souris pour l'effet "organique")
        const dx = mouse.x - this.x;
        const dy = mouse.y - this.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance < mouse.radius) {
          const forceDirectionX = dx / distance;
          const forceDirectionY = dy / distance;
          const force = (mouse.radius - distance) / mouse.radius;
          // Les particules s'écartent doucement du curseur
          this.x -= forceDirectionX * force * 1.5;
          this.y -= forceDirectionY * force * 1.5;
        }
      }

      draw() {
        ctx!.beginPath();
        ctx!.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx!.fillStyle = "rgba(168, 85, 247, 0.8)";
        ctx!.fill();
      }
    }

    const initParticles = () => {
      particles = [];
      const numParticles = Math.floor((canvas!.width * canvas!.height) / 12000); 
      for (let i = 0; i < numParticles; i++) {
        particles.push(new Particle());
      }
    };

    const animate = () => {
      ctx!.clearRect(0, 0, canvas!.width, canvas!.height);

      for (let i = 0; i < particles.length; i++) {
        particles[i].update();
        particles[i].draw();

        // 👈 NOUVEAU : Lignes connectées À LA SOURIS (Le faisceau interactif)
        const dxMouse = particles[i].x - mouse.x;
        const dyMouse = particles[i].y - mouse.y;
        const distanceMouse = Math.sqrt(dxMouse * dxMouse + dyMouse * dyMouse);
        
        if (distanceMouse < mouse.radius) {
          ctx!.beginPath();
          ctx!.moveTo(particles[i].x, particles[i].y);
          ctx!.lineTo(mouse.x, mouse.y);
          const opacity = 1 - (distanceMouse / mouse.radius);
          ctx!.strokeStyle = `rgba(168, 85, 247, ${opacity * 0.6})`;
          ctx!.lineWidth = 1.2;
          ctx!.stroke();
        }

        // Lignes connectées ENTRE particules
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const distance = Math.sqrt(dx * dx + dy * dy);

          if (distance < 120) {
            ctx!.beginPath();
            ctx!.moveTo(particles[i].x, particles[i].y);
            ctx!.lineTo(particles[j].x, particles[j].y);
            const opacity = 1 - distance / 120;
            ctx!.strokeStyle = `rgba(168, 85, 247, ${opacity * 0.3})`;
            ctx!.lineWidth = 1;
            ctx!.stroke();
          }
        }
      }

      animationFrameId = requestAnimationFrame(animate);
    };

    window.addEventListener("resize", resizeCanvas);
    resizeCanvas();
    animate();

    return () => {
      window.removeEventListener("resize", resizeCanvas);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseout", handleMouseOut);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <section className="relative min-h-screen w-full overflow-hidden bg-[#050505] flex flex-col items-center justify-center px-6">
      
      {/* 1. LE CANVAS DES CONSTELLATIONS EN FOND */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 z-0 opacity-80"
      />

      {/* 2. LE CONTENU CENTRAL (Façon Aether Flow) */}
      <div className="relative z-10 flex flex-col items-center text-center max-w-3xl mx-auto">
        
        {/* Le petit badge violet */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#1A0B2E] border border-[#a855f7]/30 mb-8"
        >
          <Zap size={14} className="text-[#a855f7]" />
          <span className="text-[12px] font-medium text-slate-300">{t("hero_badge")}</span>
        </motion.div>

        {/* Le grand titre blanc pur */}
        <motion.h1
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.1 }}
          className="text-6xl md:text-8xl lg:text-[100px] font-black tracking-tighter text-white leading-[1.0] mb-6"
        >
          {t("hero_title")}
        </motion.h1>

        {/* Le sous-titre gris clair */}
        <motion.p
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="text-lg md:text-xl text-[#A1A1AA] font-medium leading-relaxed mb-10 text-balance"
        >
          {t("hero_subtitle")}
        </motion.p>

        {/* Le bouton blanc (Identique à l'image) */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.3 }}
        >
          <Link
            href="/signup"
            className="group inline-flex items-center justify-center gap-3 px-8 py-4 rounded-xl bg-white text-black font-bold text-[15px] transition-all hover:bg-slate-200 active:scale-95"
          >
            {t("hero_cta")}
            <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
          </Link>
        </motion.div>

      </div>
    </section>
  );
}