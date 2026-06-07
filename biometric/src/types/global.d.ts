declare module '*.css' {
  const classes: { [key: string]: string };
  export default classes;
}

// Module augmentation: fixes a missing method in the installed version of
// react-native-vision-camera-resizer. The GPUFrame interface documents and
// uses dispose() in all its own examples, but omits it from the actual type
// declaration. This restores it so TypeScript is happy without unsafe casts.
declare module 'react-native-vision-camera-resizer/lib/specs/GPUFrame.nitro' {
  interface GPUFrame {
    /**
     * Frees the GPU memory held by this frame.
     * Must be called once getPixelBuffer() data has been copied to a JS array.
     */
    dispose(): void;
  }
}
