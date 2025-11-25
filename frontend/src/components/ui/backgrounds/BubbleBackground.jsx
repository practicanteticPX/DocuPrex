import PropTypes from 'prop-types';
import './bubble-background.css';

const BubbleBackground = ({ interactive = false, className = '' }) => {
  return (
    <div
      className={`bubble-background gradient-background ${className}`}
    />
  );
};

BubbleBackground.propTypes = {
  interactive: PropTypes.bool,
  className: PropTypes.string,
};

export default BubbleBackground;
