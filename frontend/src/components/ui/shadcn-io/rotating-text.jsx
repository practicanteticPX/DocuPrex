import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";

export function RotatingText({ text, className = "" }) {
  const [index, setIndex] = React.useState(0);

  React.useEffect(() => {
    const interval = setInterval(() => {
      setIndex((prevIndex) => (prevIndex + 1) % text.length);
    }, 2000);

    return () => clearInterval(interval);
  }, [text.length]);

  return (
    <div className="inline-block relative overflow-hidden" style={{ minHeight: "1.2em" }}>
      <AnimatePresence mode="wait">
        <motion.div
          key={index}
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -20, opacity: 0 }}
          transition={{ duration: 0.5 }}
          className={className}
        >
          {text[index]}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
