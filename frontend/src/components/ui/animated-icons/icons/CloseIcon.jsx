import { motion } from 'framer-motion';
import PropTypes from 'prop-types';
import AnimatedIcon from '../core/AnimatedIcon';

/**
 * Animated Close (X) Icon
 *
 * Close icon with smooth rotation animation.
 * Based on @animate-ui pattern.
 * Animates when isAnimating prop is true.
 *
 * @component
 * @example
 * const [isHovered, setIsHovered] = useState(false);
 *
 * <button
 *   onMouseEnter={() => setIsHovered(true)}
 *   onMouseLeave={() => setIsHovered(false)}
 * >
 *   <CloseIcon isAnimating={isHovered} size={20} />
 * </button>
 */
const CloseIcon = ({ isAnimating = false, ...props }) => {
  return (
    <AnimatedIcon {...props}>
      {/* Animated X group - SMOOTH BIDIRECTIONAL ROTATION */}
      <motion.g
        animate={{
          rotate: isAnimating ? 90 : 0,
        }}
        transition={{
          duration: 0.8,
          ease: 'easeInOut',
        }}
      >
        <path d="M18 6L6 18M6 6L18 18" strokeLinecap="round" strokeLinejoin="round" />
      </motion.g>
    </AnimatedIcon>
  );
};

CloseIcon.propTypes = {
  isAnimating: PropTypes.bool,
  size: PropTypes.number,
  strokeWidth: PropTypes.number,
  className: PropTypes.string,
};

export default CloseIcon;
