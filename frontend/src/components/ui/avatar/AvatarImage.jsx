import { forwardRef, useState } from 'react';
import PropTypes from 'prop-types';
import './avatar.css';

const AvatarImage = forwardRef(({ src, alt = '', className = '', ...props }, ref) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);

  if (hasError || !src) {
    return null;
  }

  return (
    <img
      ref={ref}
      src={src}
      alt={alt}
      className={`avatar-image ${isLoaded ? 'avatar-image-loaded' : ''} ${className}`}
      onLoad={() => setIsLoaded(true)}
      onError={() => setHasError(true)}
      {...props}
    />
  );
});

AvatarImage.displayName = 'AvatarImage';

AvatarImage.propTypes = {
  src: PropTypes.string,
  alt: PropTypes.string,
  className: PropTypes.string,
};

export default AvatarImage;
