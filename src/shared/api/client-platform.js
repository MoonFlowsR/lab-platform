import packageInfo from '../../../package.json' with { type: 'json' };

export function browserClient(navigatorInfo = globalThis.navigator) {
  const ua = String(navigatorInfo?.userAgent || '');
  const platform = String(navigatorInfo?.platform || '');
  // iPad desktop mode can identify as a Mac; touch capability separates it.
  if (navigatorInfo?.userAgentData?.mobile === true || /Android|iPhone|iPad|iPod|Mobile|Tablet|IEMobile|Windows Phone|Silk\//i.test(ua)
    || /Macintosh|MacIntel/i.test(platform + ' ' + ua) && navigatorInfo?.maxTouchPoints > 1) return 'mobile';
  if (navigatorInfo?.userAgentData?.mobile === false || /Windows NT|Macintosh|Mac OS X|X11|Linux|CrOS/i.test(ua)) return 'pc';
  return 'unknown';
}

export const clientHeaders = () => ({ 'X-Platform-Client': browserClient(), 'X-Platform-UI-Version': packageInfo.version });
