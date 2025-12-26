import React from 'react';
import PropTypes from 'prop-types';
import { cn } from '@/lib/utils';

import technomartLogo from '@/assets/technomart-logo.png';

export const AUTH_BRAND_BADGE_IMAGE = technomartLogo;

const AuthBrandIntro = ({
  badgeImageSrc = AUTH_BRAND_BADGE_IMAGE,
  badgeImageAlt = 'Technomart logo',
  badgeImageClassName = 'h-12 w-12 object-contain rounded-xl',
  badgeText = '',
  badgeClassName = 'h-12 w-12',
  badgeTextClassName = 'text-primary font-semibold text-xl',
  title,
  description,
  className = '',
  contentClassName = 'space-y-2',
  titleClassName = '',
  descriptionClassName = '',
  children,
}) => {
  const badgeImageClasses = [badgeClassName, badgeImageClassName]
    .filter(Boolean)
    .join(' ');
  const badgeTextClasses = [badgeClassName, badgeTextClassName]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={cn(
        'flex flex-col items-center md:items-start justify-center text-center md:text-left space-y-3',
        className
      )}
    >
      {(badgeImageSrc || badgeText) && (
        <div className="flex w-full items-center justify-center md:w-auto md:justify-start">
          {badgeImageSrc ? (
            <img
              src={badgeImageSrc}
              alt={badgeImageAlt}
              className={cn(badgeImageClasses, 'mx-auto md:mx-0')}
            />
          ) : (
            <span className={cn(badgeTextClasses, 'mx-auto md:mx-0')}>
              {badgeText}
            </span>
          )}
        </div>
      )}
      <div className={contentClassName}>
        {title && (
          <h1
            className={cn(
              'text-3xl sm:text-4xl font-semibold text-gray-900',
              titleClassName
            )}
          >
            {title}
          </h1>
        )}
        {description && (
          <p
            className={cn(
              'text-sm text-gray-600 max-w-sm mx-auto md:mx-0',
              descriptionClassName
            )}
          >
            {description}
          </p>
        )}
        {children}
      </div>
    </div>
  );
};

AuthBrandIntro.propTypes = {
  badgeImageSrc: PropTypes.string,
  badgeImageAlt: PropTypes.string,
  badgeImageClassName: PropTypes.string,
  badgeText: PropTypes.string,
  badgeClassName: PropTypes.string,
  badgeTextClassName: PropTypes.string,
  title: PropTypes.node,
  description: PropTypes.node,
  className: PropTypes.string,
  contentClassName: PropTypes.string,
  titleClassName: PropTypes.string,
  descriptionClassName: PropTypes.string,
  children: PropTypes.node,
};

export default AuthBrandIntro;
