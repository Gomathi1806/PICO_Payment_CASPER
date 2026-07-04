export const isInAppBrowser = () => {
  if (typeof window === 'undefined') return false;
  
  const ua = window.navigator.userAgent || window.navigator.vendor || ((window as any).opera as string | undefined) || '';
  
  // Detect common In-App Browsers
  const isInstagram = ua.indexOf('Instagram') > -1;
  const isFB = ua.indexOf('FBAN') > -1 || ua.indexOf('FBAV') > -1;
  const isTikTok = ua.indexOf('TikTok') > -1;
  
  return isInstagram || isFB || isTikTok;
};

export const getBrowserName = () => {
  if (typeof window === 'undefined') return 'Unknown';
  
  const ua = window.navigator.userAgent;
  if (ua.indexOf('Instagram') > -1) return 'Instagram';
  if (ua.indexOf('TikTok') > -1) return 'TikTok';
  if (ua.indexOf('FBAN') > -1 || ua.indexOf('FBAV') > -1) return 'Facebook';
  
  return 'System Browser';
};
