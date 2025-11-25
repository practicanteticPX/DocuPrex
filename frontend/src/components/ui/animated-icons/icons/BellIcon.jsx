import { motion } from 'framer-motion';
import PropTypes from 'prop-types';
import AnimatedIcon from '../core/AnimatedIcon';

/**
 * Animated Bell Icon
 *
 * Bell/notification icon with subtle ring/shake animation.
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
 *   <BellIcon isAnimating={isHovered} size={20} />
 * </button>
 */
const BellIcon = ({ isAnimating = false, ...props }) => {
  return (
    <AnimatedIcon {...props}>
      {/* Animated bell group - RING/SHAKE ANIMATION */}
      <motion.g
        animate={{
          rotate: isAnimating ? [0, -15, 15, -10, 10, -5, 5, 0] : 0,
        }}
        transition={{
          duration: 0.6,
          ease: 'easeInOut',
        }}
        style={{
          transformOrigin: 'top center',
        }}
      >
        <path
          d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M13.73 21a2 2 0 0 1-3.46 0"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </motion.g>
    </AnimatedIcon>
  );
};

BellIcon.propTypes = {
  isAnimating: PropTypes.bool,
  size: PropTypes.number,
  strokeWidth: PropTypes.number,
  className: PropTypes.string,
};

export default BellIcon;
