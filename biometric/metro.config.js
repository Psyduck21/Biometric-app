const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Register .tflite binary model files as Metro assets so that
// require('../../assets/models/.../*.tflite') resolves correctly.
config.resolver.assetExts.push('tflite');

module.exports = config;
