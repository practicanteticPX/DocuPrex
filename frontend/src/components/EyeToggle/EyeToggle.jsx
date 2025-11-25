import { useRef, useEffect } from 'react';
import Lottie from 'lottie-react';
import eyeAnimation from '../../assets/icons/animations/eye-animation.json';
import './EyeToggle.css';

function EyeToggle({ isVisible, onClick, ariaLabel }) {
  const lottieRef = useRef(null);

  useEffect(() => {
    if (lottieRef.current) {
      if (isVisible) {
        lottieRef.current.playSegments([0, 12], true);
      } else {
        lottieRef.current.playSegments([12, 17], true);
      }
    }
  }, [isVisible]);

  return (
    <button
      type="button"
      className="eye-toggle"
      onClick={onClick}
      aria-label={ariaLabel}
    >
      <Lottie
        lottieRef={lottieRef}
        animationData={eyeAnimation}
        loop={false}
        autoplay={false}
        style={{ width: 20, height: 20 }}
      />
    </button>
  );
}

export default EyeToggle;
