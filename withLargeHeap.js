const { withAndroidManifest } = require('@expo/config-plugins');

module.exports = function withLargeHeap(config) {
  return withAndroidManifest(config, async (config) => {
    const manifest = config.modResults;
    const app = manifest.manifest.application[0];
    app.$['android:largeHeap'] = 'true';
    return config;
  });
};
