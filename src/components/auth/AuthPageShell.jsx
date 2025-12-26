import React, { useId } from 'react';
import PropTypes from 'prop-types';

import adminMain from '@/assets/admin-MAIN.png';

export const AUTH_PAGE_DEFAULT_BACKGROUND = adminMain;
const baseWavePrimaryPath = 'M0 0H800V800H0C180 550 320 350 0 160Z';
const baseWaveSecondaryPath = 'M200 0H800V800H120C340 630 460 330 200 120Z';

const AuthPageShell = ({
  backgroundImage = AUTH_PAGE_DEFAULT_BACKGROUND,
  overlayClassName = 'bg-white/80',
  waveImage,
  waveClassName = 'pointer-events-none absolute right-0 inset-y-0 w-[65%] max-w-[620px]',
  wavePrimary = '#FFE797',
  wavePrimaryOpacity = 0.75,
  waveSecondary = '#ffe27b',
  waveSecondaryOpacity = 0.65,
  wavePaths,
  containerClassName = '',
  paddingClassName = 'px-4 py-12',
  gridClassName = '',
  formWrapperClassName = '',
  asideWrapperClassName = '',
  formSlot,
  asideSlot,
}) => {
  const clipId = useId();
  const wavePathData = wavePaths || [
    { d: baseWavePrimaryPath, fill: wavePrimary, opacity: wavePrimaryOpacity },
    {
      d: baseWaveSecondaryPath,
      fill: waveSecondary,
      opacity: waveSecondaryOpacity,
    },
  ];

  const backgroundStyle = backgroundImage
    ? {
        backgroundImage: `url(${backgroundImage})`,
      }
    : undefined;

  return (
    <div
      className={`relative min-h-screen flex items-center justify-center overflow-hidden ${paddingClassName} ${containerClassName}`.trim()}
    >
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={backgroundStyle}
        />
        {overlayClassName && (
          <div className={`absolute inset-0 ${overlayClassName}`} />
        )}
      </div>

      {(waveImage || wavePathData.length > 0) && (
        <div className={waveClassName} aria-hidden="true">
          <svg
            className="w-full h-full"
            viewBox="0 0 800 800"
            preserveAspectRatio="none"
          >
            <defs>
              <clipPath id={clipId}>
                <path d={baseWavePrimaryPath} />
              </clipPath>
            </defs>
            {waveImage && (
              <image
                href={waveImage}
                xlinkHref={waveImage}
                x="0"
                y="0"
                width="800"
                height="800"
                preserveAspectRatio="xMidYMid slice"
                clipPath={`url(#${clipId})`}
                opacity="0.9"
              />
            )}
            {wavePathData.map(({ d, fill, opacity }, idx) =>
              fill ? (
                <path key={idx} d={d} fill={fill} opacity={opacity} />
              ) : null
            )}
          </svg>
        </div>
      )}

      <div
        className={`relative z-10 w-full max-w-full sm:max-w-5xl grid md:grid-cols-[minmax(0,420px)_minmax(0,1fr)] items-center gap-2.5 px-0 sm:px-4 md:px-0 ${gridClassName}`.trim()}
      >
        {asideSlot && <div className={asideWrapperClassName}>{asideSlot}</div>}
        {formSlot && (
          <div className={`w-full ${formWrapperClassName}`.trim()}>
            {formSlot}
          </div>
        )}
      </div>
    </div>
  );
};

AuthPageShell.propTypes = {
  backgroundImage: PropTypes.string,
  overlayClassName: PropTypes.string,
  waveImage: PropTypes.string,
  waveClassName: PropTypes.string,
  wavePrimary: PropTypes.string,
  wavePrimaryOpacity: PropTypes.number,
  waveSecondary: PropTypes.string,
  waveSecondaryOpacity: PropTypes.number,
  wavePaths: PropTypes.arrayOf(
    PropTypes.shape({
      d: PropTypes.string.isRequired,
      fill: PropTypes.string,
      opacity: PropTypes.number,
    })
  ),
  containerClassName: PropTypes.string,
  paddingClassName: PropTypes.string,
  gridClassName: PropTypes.string,
  formWrapperClassName: PropTypes.string,
  asideWrapperClassName: PropTypes.string,
  formSlot: PropTypes.node,
  asideSlot: PropTypes.node,
};

export default AuthPageShell;
