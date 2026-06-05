# Aegis

**Enterprise Biometric Authentication & Attendance Platform**

Aegis is an offline-first, high-security biometric attendance system designed for remote and disconnected environments. It leverages on-device Machine Learning (MobileFaceNet & MiniFASNet) to provide instantaneous identity verification without requiring an active internet connection.

## Features
* **Face Recognition:** On-device 512-dimensional facial embedding generation via Fast TFLite.
* **Active Liveness:** Challenge-response system requiring blinks, smiles, and head turns.
* **Passive Anti-Spoofing:** Depth and texture analysis to prevent photo/screen replay attacks.
* **Device Binding:** ECDSA P-256 cryptographic signatures bind attendance records to specific hardware.
* **Offline Authentication:** Encrypted SQLite template storage for clocking in without a network.
* **Background Sync:** Automatic exponential backoff queue for uploading attendance records natively via Expo Background Fetch.

## Architecture Diagram
```text
Camera
   ↓
Face Detection (MediaPipe)
   ↓
Liveness Challenge Engine
   ↓
Passive Anti-Spoof (MiniFASNet)
   ↓
Alignment & Cropping
   ↓
Embedding (MobileFaceNet)
   ↓
Authentication (AES-256-GCM Decryption & Cosine Similarity)
```

## Technology Stack
- **Framework:** React Native 0.81 (New Architecture) & Expo SDK 54
- **Computer Vision:** Vision Camera v5 (Nitro Modules)
- **Machine Learning:** React Native Fast TFLite & MediaPipe Face Detection
- **Database:** OP-SQLite
- **Backend:** Supabase (PostgreSQL)

## Installation & Setup
1. Clone the repository
2. Run `npm install`
3. Setup your `.env` with:
   - `EXPO_PUBLIC_SUPABASE_PROJECT_URL`
   - `EXPO_PUBLIC_SUPABASE_API_KEY`

## Running Development Build
```bash
npx expo run:android
# OR
npx expo run:ios
```

## Building Production App
```bash
eas build --platform android --profile production
```

## Security Architecture
Aegis does not store raw images. Facial data is immediately converted into an irreversible mathematical embedding array. This array is encrypted locally using AES-256-GCM, with the decryption key locked safely inside the hardware-backed Android Keystore / iOS Secure Enclave via `react-native-keychain`.

## Known Limitations
* **OTA Updates:** Because the ML models are bundled natively via `assetBundlePatterns`, OTA updates that change `.tflite` files require a strict `runtimeVersion` bump and a new native build.
* **Background Sync:** Background sync on Android is subject to OEM Battery Manager restrictions (e.g. Samsung Doze). To mitigate this, `AppState` listeners trigger immediate syncs when the app is foregrounded.

## Future Improvements
* Cloud-based template invalidation and ECDSA key rotation.
* Support for Iris scanning as an additional biometric modality.
