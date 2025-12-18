import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import './RejectingLoadingScreen.css';

/**
 * RejectingLoadingScreen - Pantalla de carga durante el proceso de rechazo
 *
 * Muestra una animación profesional con textos rotativos que describen
 * los pasos del proceso de rechazo de documentos.
 */
const RejectingLoadingScreen = () => {
  console.log('✅ RejectingLoadingScreen montado');

  const rejectingTexts = [
    'Verificando documento',
    'Validando rechazo',
    'Registrando motivo',
    'Notificando involucrados',
    'Actualizando estado',
    'Finalizando proceso'
  ];

  const [currentTextIndex, setCurrentTextIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTextIndex((prevIndex) => (prevIndex + 1) % rejectingTexts.length);
    }, 2000);

    return () => clearInterval(interval);
  }, [rejectingTexts.length]);

  const currentText = rejectingTexts[currentTextIndex];
  const words = currentText.split(' ');
  const firstWord = words[0];
  const restOfText = words.slice(1).join(' ');

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="rejecting-screen-overlay"
    >
      <div className="rejecting-screen-content">
        <div className="rejecting-screen-text-container">
          <div className="rejecting-screen-rotating-container">
            <AnimatePresence mode="wait">
              <motion.div
                key={currentTextIndex}
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: -20, opacity: 0 }}
                transition={{ duration: 0.3 }}
                className="rejecting-screen-rotating-text"
              >
                <span className="rejecting-screen-first-word">{firstWord}</span>
                {restOfText && <span className="rejecting-screen-rest-text"> {restOfText}</span>}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default RejectingLoadingScreen;
