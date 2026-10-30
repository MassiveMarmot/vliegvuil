// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
// Banner component for displaying status messages

import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '../icons/Icon';
import type { IconName } from '../icons/paths';

export interface BannerProps {
  type: 'info' | 'warning' | 'error';
  message: string;
  visible: boolean;
  onDismiss?: () => void;
  autoHide?: boolean;
  duration?: number;
}

// Banner styling based on type
const BANNER_STYLES: Record<'info' | 'warning' | 'error', { bg: string; text: string; border: string }> = {
  info: {
    bg: 'bg-blue-100',
    text: 'text-blue-800',
    border: 'border-blue-400',
  },
  warning: {
    bg: 'bg-yellow-100',
    text: 'text-yellow-800',
    border: 'border-yellow-400',
  },
  error: {
    bg: 'bg-red-100',
    text: 'text-red-800',
    border: 'border-red-400',
  },
};

/**
 * Banner component for displaying status/alert messages
 */
export function Banner({ type, message, visible, onDismiss, autoHide = false, duration = 5000 }: BannerProps): React.ReactElement | null {
  const { t } = useTranslation();
  const styles = BANNER_STYLES[type];

  useEffect(() => {
    if (visible && autoHide && onDismiss) {
      const timer = setTimeout(() => {
        onDismiss();
      }, duration);
      return (): void => clearTimeout(timer);
    }
  }, [visible, autoHide, onDismiss, duration]);

  if (!visible || !message) {
    return null;
  }

  return (
    <div
      className={`fixed top-4 left-1/2 transform -translate-x-1/2 z-50 ${styles.bg} ${styles.text} border ${styles.border} rounded px-4 py-2 shadow-lg`}
      role="alert"
      aria-live="polite"
    >
      <span className="mr-2"><Icon name={bannerIcon(type)} size={18} /></span>
      <span>{message}</span>
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="ml-4 text-lg font-bold hover:opacity-70"
          aria-label={t('banner.close', 'Sluiten')}
        >
          &times;
        </button>
      )}
    </div>
  );
}

// Lucide icon for banner type (replaces the emoji set)
function bannerIcon(type: 'info' | 'warning' | 'error'): IconName {
  switch (type) {
    case 'info':
      return 'info';
    case 'warning':
      return 'triangle-alert';
    case 'error':
      return 'octagon-x';
    default:
      return 'info';
  }
}

// Simple banner without Tailwind (for plain CSS)
export function SimpleBanner({ type, message, visible, onDismiss }: BannerProps): React.ReactElement | null {
  const { t } = useTranslation();
  if (!visible || !message) {
    return null;
  }

  return (
    <div
      className={`banner banner-${type}`}
      role="alert"
      aria-live="polite"
    >
      <span className="banner-icon"><Icon name={bannerIcon(type)} size={18} /></span>
      <span>{message}</span>
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="banner-button"
          aria-label={t('banner.close', 'Sluiten')}
        >
          <Icon name="x" size={18} />
        </button>
      )}
    </div>
  );
}

export default Banner;
