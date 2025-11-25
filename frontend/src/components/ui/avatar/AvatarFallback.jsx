import { forwardRef } from 'react';
import PropTypes from 'prop-types';
import './avatar.css';

const AvatarFallback = forwardRef(({ children, className = '', ...props }, ref) => {
  return (
    <div ref={ref} className={`avatar-fallback ${className}`} {...props}>
      {children}
    </div>
  );
});

AvatarFallback.displayName = 'AvatarFallback';

AvatarFallback.propTypes = {
  children: PropTypes.node,
  className: PropTypes.string,
};

export default AvatarFallback;
