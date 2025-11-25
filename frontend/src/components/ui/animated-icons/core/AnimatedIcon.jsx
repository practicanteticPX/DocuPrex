import { motion } from 'framer-motion';
import PropTypes from 'prop-types';

/**
 * Base Animated Icon Component
 *
 * Provides reusable animation logic for SVG icons using framer-motion.
 * Supports hover-triggered and continuous animations.
 *
 * @component
 * @example
 * <AnimatedIcon size={24} animateOnHover>
 *   <motion.g animate={...}>
 *     <path d="..." />
 *   </motion.g>
 * </AnimatedIcon>
 */
const AnimatedIcon = ({
  children,
  size = 24,
  strokeWidth = 2,
  className = '',
  animateOnHover = false,
  animationConfig = {},
  ...props
}) => {
  return (
    <motion.svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={{ display: 'inline-block' }}
      {...props}
    >
      {children}
    </motion.svg>
  );
};

AnimatedIcon.propTypes = {
  children: PropTypes.node.isRequired,
  size: PropTypes.number,
  strokeWidth: PropTypes.number,
  className: PropTypes.string,
  animateOnHover: PropTypes.bool,
  animationConfig: PropTypes.object,
};

export default AnimatedIcon;
