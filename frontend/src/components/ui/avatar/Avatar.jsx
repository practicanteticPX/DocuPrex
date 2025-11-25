import { forwardRef } from 'react';
import PropTypes from 'prop-types';
import './avatar.css';

const Avatar = forwardRef(({ children, className = '', ...props }, ref) => {
  return (
    <div ref={ref} className={`avatar ${className}`} {...props}>
      {children}
    </div>
  );
});

Avatar.displayName = 'Avatar';

Avatar.propTypes = {
  children: PropTypes.node,
  className: PropTypes.string,
};

export default Avatar;
