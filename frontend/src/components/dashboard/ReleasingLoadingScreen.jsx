import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import './ReleasingLoadingScreen.css';

/**
 * ReleasingLoadingScreen - Pantalla de carga durante el proceso de liberación
 *
 * Muestra una animación profesional con textos rotativos que describen
 * los pasos del proceso de liberación de facturas retenidas.
 */
const ReleasingLoadingScreen = () => {
  console.log('✅ ReleasingLoadingScreen montado');

  const releasingTexts = [
    'Verificando retención',
    'Validando estado',
    'Liberando factura',
    'Regenerando documento',
    'Notificando cambios',
    'Finalizando proceso'
  ];

  const [currentTextIndex, setCurrentTextIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTextIndex((prevIndex) => (prevIndex + 1) % releasingTexts.length);
    }, 2000); // Cambiar texto cada 2 segundos

    return () => clearInterval(interval);
  }, [releasingTexts.length]);

  // Dividir el texto en primera palabra y resto
  const currentText = releasingTexts[currentTextIndex];
  const words = currentText.split(' ');
  const firstWord = words[0];
  const restOfText = words.slice(1).join(' ');

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="releasing-screen-overlay"
    >
      <div className="releasing-screen-content">
        <div className="releasing-screen-text-container">
          <div className="releasing-screen-rotating-container">
            <AnimatePresence mode="wait">
              <motion.div
                key={currentTextIndex}
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: -20, opacity: 0 }}
                transition={{ duration: 0.3 }}
                className="releasing-screen-rotating-text"
              >
                <span className="releasing-screen-first-word">{firstWord}</span>
                {restOfText && <span className="releasing-screen-rest-text"> {restOfText}</span>}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default ReleasingLoadingScreen;
