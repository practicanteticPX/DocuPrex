import { forwardRef } from 'react';
import PropTypes from 'prop-types';
import './avatar.css';

const AvatarGroupTooltip = forwardRef(({ children, className = '', ...props }, ref) => {
  return (
    <div ref={ref} className={`avatar-group-tooltip ${className}`} {...props}>
      {children}
    </div>
  );
});

AvatarGroupTooltip.displayName = 'AvatarGroupTooltip';

AvatarGroupTooltip.propTypes = {
  children: PropTypes.node,
  className: PropTypes.string,
};

export default AvatarGroupTooltip;
