const { withDangerousMod, withAndroidManifest } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

module.exports = function withProductionHarden(config) {
  // 1. Add ProGuard Rules
  config = withDangerousMod(config, [
    'android',
    async (config) => {
      const proguardPath = path.join(config.modRequest.platformProjectRoot, 'app', 'proguard-rules.pro');
      if (fs.existsSync(proguardPath)) {
        let contents = fs.readFileSync(proguardPath, 'utf-8');
        const customRules = `\n# JNI Bindings for Worklets and Native Modules\n-keep class com.margelo.nitro.** { *; }\n-keep class com.mrousavy.camera.** { *; }\n-keep class com.reactnativeworklets.** { *; }\n`;
        if (!contents.includes('com.margelo.nitro')) {
          fs.writeFileSync(proguardPath, contents + customRules);
        }
      }
      return config;
    },
  ]);

  // 2. Disable AllowBackup in Manifest
  config = withAndroidManifest(config, (config) => {
    const manifest = config.modResults;
    const app = manifest.manifest.application[0];
    app.$['android:allowBackup'] = 'false';
    return config;
  });

  return config;
};
