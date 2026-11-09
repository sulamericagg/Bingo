import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.sulamericagg.blooporbit',
  appName: 'Bloop World',
  webDir: 'dist',
  android: {
    backgroundColor: '#0b0620',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 900,
      backgroundColor: '#0b0620',
      showSpinner: false,
      androidScaleType: 'CENTER_CROP',
    },
    LocalNotifications: {
      smallIcon: 'ic_stat_bloop',
      iconColor: '#ff7ad9',
    },
  },
};

export default config;
