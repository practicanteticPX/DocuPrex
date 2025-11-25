import { forwardRef } from 'react';
import PropTypes from 'prop-types';
import './avatar.css';

const AvatarGroupTooltipArrow = forwardRef(({ className = '', ...props }, ref) => {
  return (
    <div ref={ref} className={`avatar-group-tooltip-arrow ${className}`} {...props} />
  );
});

AvatarGroupTooltipArrow.displayName = 'AvatarGroupTooltipArrow';

AvatarGroupTooltipArrow.propTypes = {
  className: PropTypes.string,
};

export default AvatarGroupTooltipArrow;
