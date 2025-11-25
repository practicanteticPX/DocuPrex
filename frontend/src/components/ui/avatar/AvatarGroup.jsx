import { forwardRef } from 'react';
import PropTypes from 'prop-types';
import './avatar.css';

const AvatarGroup = forwardRef(({ children, className = '', ...props }, ref) => {
  return (
    <div ref={ref} className={`avatar-group ${className}`} {...props}>
      {children}
    </div>
  );
});

AvatarGroup.displayName = 'AvatarGroup';

AvatarGroup.propTypes = {
  children: PropTypes.node,
  className: PropTypes.string,
};

export default AvatarGroup;
