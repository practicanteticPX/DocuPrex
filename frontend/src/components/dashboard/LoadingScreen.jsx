import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { RotatingText } from '@/components/ui/shadcn-io/rotating-text';
import './LoadingScreen.css';

const LoadingScreen = () => {
  const loadingTexts = [
    'Negociador',
    'Centros de Costos',
    'Cuentas Contables',
    'Información',
    'Documento'
  ];

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.3 }}
        className="loading-screen-overlay"
      >
        <div className="loading-screen-content">
          <div className="loading-screen-text-container">
            <span className="loading-screen-static-text">Cargando</span>
            <RotatingText
              className="loading-screen-rotating-text"
              text={loadingTexts}
            />
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

export default LoadingScreen;
