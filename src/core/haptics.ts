import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { isNative } from './platform';
import { save } from './storage';

export function tap(strength: 'light' | 'medium' | 'heavy' = 'light'): void {
  if (!save.haptics) return;
  if (isNative) {
    const style = strength === 'heavy' ? ImpactStyle.Heavy : strength === 'medium' ? ImpactStyle.Medium : ImpactStyle.Light;
    Haptics.impact({ style }).catch(() => {});
  } else if (navigator.vibrate) {
    navigator.vibrate(strength === 'heavy' ? 40 : strength === 'medium' ? 18 : 8);
  }
}

export function success(): void {
  if (!save.haptics) return;
  if (isNative) Haptics.notification({ type: NotificationType.Success }).catch(() => {});
  else navigator.vibrate?.([10, 40, 20]);
}
