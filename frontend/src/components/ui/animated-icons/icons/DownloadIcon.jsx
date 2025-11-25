import { motion } from 'framer-motion';
import PropTypes from 'prop-types';
import AnimatedIcon from '../core/AnimatedIcon';

/**
 * Animated Download Icon
 *
 * Download icon with smooth arrow animation.
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
 *   <DownloadIcon isAnimating={isHovered} size={20} />
 * </button>
 */
const DownloadIcon = ({ isAnimating = false, ...props }) => {
  return (
    <AnimatedIcon {...props}>
      {/* Static container box */}
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />

      {/* Animated arrow group - ONE SIMPLE ANIMATION */}
      <motion.g
        animate={
          isAnimating
            ? {
                y: [0, 3, 0],
                transition: {
                  duration: 1.2,
                  repeat: Infinity,
                  ease: 'easeInOut',
                },
              }
            : { y: 0 }
        }
      >
        <path d="M7 10l5 5 5-5" />
        <path d="M12 15V3" />
      </motion.g>
    </AnimatedIcon>
  );
};

DownloadIcon.propTypes = {
  isAnimating: PropTypes.bool,
  size: PropTypes.number,
  strokeWidth: PropTypes.number,
  className: PropTypes.string,
};

export default DownloadIcon;
