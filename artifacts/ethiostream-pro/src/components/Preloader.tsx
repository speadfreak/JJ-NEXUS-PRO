import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export function Preloader({ onComplete }: { onComplete: () => void }) {
  const [phase, setPhase] = useState(0);
  const phases = [
    "Initializing Alchemist AI...",
    "Loading Market Data...",
    "Connecting Live Streams...",
    "Ready"
  ];

  useEffect(() => {
    let currentPhase = 0;
    const interval = setInterval(() => {
      currentPhase++;
      if (currentPhase < phases.length) {
        setPhase(currentPhase);
      }
    }, 800);

    const timeout = setTimeout(() => {
      onComplete();
    }, 3500);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [onComplete]);

  return (
    <motion.div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#050505] overflow-hidden"
      initial={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.1, filter: "blur(10px)" }}
      transition={{ duration: 0.8, ease: "easeInOut" }}
    >
      <div className="relative flex flex-col items-center z-10">
        <motion.div
          initial={{ scale: 0.3, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 1.2, ease: "easeOut" }}
          style={{ filter: "drop-shadow(0 0 40px rgba(212,175,55,0.6))" }}
        >
          <img src="/jj-trades-logo.jpg" alt="JJ Trades Logo" className="w-32 h-32 rounded-full object-cover border-2 border-[var(--gold)]" />
        </motion.div>
        
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1, duration: 0.8 }}
          className="mt-6 text-3xl md:text-5xl font-serif text-[var(--gold)] tracking-[0.3em] font-bold text-center"
        >
          JJ NEXUS PRO
        </motion.h1>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.5, duration: 0.8 }}
          className="mt-2 text-[hsl(var(--muted-foreground))] font-sans tracking-widest text-sm uppercase text-center"
        >
          The Ultimate Trading Command Center
        </motion.p>

        <div className="mt-12 relative w-48 h-48 flex items-center justify-center">
          <svg className="absolute inset-0 w-full h-full transform -rotate-90">
            <circle
              cx="96" cy="96" r="80"
              fill="none"
              stroke="rgba(212,175,55,0.2)"
              strokeWidth="2"
            />
            <motion.circle
              cx="96" cy="96" r="80"
              fill="none"
              stroke="var(--gold)"
              strokeWidth="2"
              strokeDasharray="502"
              initial={{ strokeDashoffset: 502 }}
              animate={{ strokeDashoffset: 0 }}
              transition={{ duration: 3, ease: "linear" }}
            />
          </svg>
          <motion.div
            key={phase}
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            className="absolute text-center text-xs text-[var(--gold)] font-mono w-full px-4"
          >
            {phases[phase]}
          </motion.div>
        </div>
      </div>

      <motion.div
        className="absolute bottom-0 w-full h-2 flex"
        initial={{ x: "-100%" }}
        animate={{ x: "0%" }}
        transition={{ delay: 0.5, duration: 1.5, ease: "easeOut" }}
      >
        <div className="flex-1 bg-[var(--eth-green)]"></div>
        <div className="flex-1 bg-yellow-400"></div>
        <div className="flex-1 bg-[var(--eth-red)]"></div>
      </motion.div>
    </motion.div>
  );
}
