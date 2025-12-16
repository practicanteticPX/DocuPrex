import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import './SigningLoadingScreen.css';

/**
 * SigningLoadingScreen - Pantalla de carga durante el proceso de firma
 *
 * Muestra una animación profesional con textos rotativos que describen
 * los pasos del proceso de firma de documentos.
 */
const SigningLoadingScreen = () => {
  console.log('✅ SigningLoadingScreen montado');

  const signingTexts = [
    'Verificando documento',
    'Validando identidad',
    'Registrando firma',
    'Notificando firmantes',
    'Actualizando estado',
    'Finalizando proceso'
  ];

  const [currentTextIndex, setCurrentTextIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTextIndex((prevIndex) => (prevIndex + 1) % signingTexts.length);
    }, 2000); // Cambiar texto cada 2 segundos

    return () => clearInterval(interval);
  }, [signingTexts.length]);

  // Dividir el texto en primera palabra y resto
  const currentText = signingTexts[currentTextIndex];
  const words = currentText.split(' ');
  const firstWord = words[0];
  const restOfText = words.slice(1).join(' ');

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="signing-screen-overlay"
    >
      <div className="signing-screen-content">
        <div className="signing-screen-text-container">
          <div className="signing-screen-rotating-container">
            <AnimatePresence mode="wait">
              <motion.div
                key={currentTextIndex}
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: -20, opacity: 0 }}
                transition={{ duration: 0.3 }}
                className="signing-screen-rotating-text"
              >
                <span className="signing-screen-first-word">{firstWord}</span>
                {restOfText && <span className="signing-screen-rest-text"> {restOfText}</span>}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default SigningLoadingScreen;
