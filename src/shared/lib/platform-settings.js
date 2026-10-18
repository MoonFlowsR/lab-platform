import settings from '../../config/platform-settings.json' with { type: 'json' };
export const platformSettings = settings;
export const loginLabel = settings.loginIdentifier === 'identifier' ? '登录账号' : '姓名';
export const loginHint = settings.loginIdentifier === 'identifier' ? '2–32位文字、数字、点、下划线或短横线' : '中文姓名，2–12字，可含间隔号 ·';
export const graduationYears = Array.from({length:settings.graduationYearEnd-settings.graduationYearStart+1},(_,i)=>settings.graduationYearStart+i);
export function isValidLoginId(value) { const text=String(value||'').trim();return settings.loginIdentifier==='identifier' ? /^[\p{L}\p{N}_.-]{2,32}$/u.test(text) : /^[\u4e00-\u9fa5·]{2,12}$/.test(text); }
