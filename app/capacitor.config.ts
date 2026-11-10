import type { CapacitorConfig } from '@capacitor/cli';

// The iOS and Android apps bundle dist/ (npm run ios / npm run android); nothing is loaded from press.flyleaf.cc.
// The id stays com.feyidesigns.press whatever the store name ends up being: a bundle id can never change.
const config: CapacitorConfig = {
  appId: 'com.feyidesigns.press',
  appName: 'Bookprint',
  webDir: 'dist',
  ios: { contentInset: 'never' },
  // Google and Apple sign-in only. Facebook and Twitter off, or the Facebook SDK
  // adds the advertising ID permission (Play's ad ID answer is No).
  plugins: { SocialLogin: { providers: { google: true, apple: true, facebook: false, twitter: false } } },
};

export default config;
