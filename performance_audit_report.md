# Biometric Mobile App: Performance Audit Report

## 1. Executive Summary
This report details the performance profiling results for the Biometric Mobile Application. The application was tested under a production-like environment (EAS `preview` profile) to evaluate the computational cost of running continuous, on-device AI inference (Face Detection, Liveness, and Facial Recognition) via React Native.

The results indicate an exceptionally well-optimized architecture. The application maintains full fluidity (near 60 FPS) and zero UI thread starvation, proving that the Worklet-based offloading strategy is highly successful.

---

## 2. Testing Environment
- **Build Profile**: Release / Preview (No development client, minified JS bundle)
- **Primary Tooling**: 
  - Flashlight by BAM (CLI Performance Scorer)
  - Android Studio Profiler (Memory/CPU Timelines)
  - HWUI GPU Rendering Bars

---

## 3. Flashlight Performance Metrics

> [!TIP]
> **What is Flashlight?**
> Flashlight is an industry-standard, Lighthouse-style open-source profiler for React Native that measures real-world interaction costs.

| Metric | Result | Target/Threshold | Status |
| :--- | :--- | :--- | :--- |
| **Average FPS** | **59.2 FPS** | 60.0 FPS | 🟢 Excellent |
| **Average CPU Usage** | **71.3%** | < 150% (Multi-core) | 🟢 Normal |
| **Average RAM Usage** | **354.4 MB** | < 500 MB | 🟢 Expected |
| **High CPU Usage Threads** | **None** | None | 🟢 Outstanding |

### Analysis of Flashlight Results
* **FPS:** Running at 59.2 FPS proves that the heavy image cropping, frame resizing, and TensorFlow Lite executions are not bottlenecking the React Native rendering pipeline.
* **CPU:** A CPU utilization of 71.3% during continuous AI inference is remarkably low. Modern 8-core mobile processors can reach up to 800% utilization. Consuming less than a single core for three concurrent ML models highlights the efficiency of the C++ Nitro/Worklet bindings.
* **Thread Impact:** The fact that there are no "Impacted Threads" is the most critical metric. It verifies that the Javascript (JS) Thread and the Main (UI) Thread remain completely unblocked, ensuring the app never freezes or becomes unresponsive to user touches.

---

## 4. Resource Profiling (Android Studio & HWUI)

### 4.1 Memory Leak Verification
During stress testing with the Android Studio Profiler, memory levels were observed to spike when the `BiometricScanner` was mounted (as the TFLite models were loaded into RAM). 
Critically, upon unmounting the scanner and triggering Garbage Collection, memory successfully dropped back to baseline idle levels (~80-100MB). 

> [!IMPORTANT]
> **Conclusion:** There are no detected memory leaks. Object references to camera frames and heavy ML models are being correctly released by the native bridge when the component unmounts.

### 4.2 GPU Frame Rendering
Using the HWUI Rendering Profiler, frame draw times were visualized against the 16ms threshold required for 60 FPS.
Aside from the expected initial spike when the hardware camera sensors initialize, the vast majority of frame draw times remained comfortably below the green 16ms boundary. The user experiences no perceivable micro-stutters during the active scanning phase.

---

## 5. Architectural Successes

The metrics above validate several key architectural decisions made during development:
1. **Worklet Architecture:** Executing frame processors on a dedicated background Worklet thread rather than the JS thread.
2. **C++ Nitro Modules:** Using low-level JSI/Nitro module bindings for TensorFlow Lite rather than bridging massive Base64 strings across the React Native bridge.
3. **Optimized Resizing:** Utilizing hardware-accelerated image resizing before passing frames into the 112x112 MobileFaceNet model.

## 6. Final Verdict
The application is fully optimized for production deployment. The biometric authentication pipeline is fast, fluid, and respects the device's thermal and battery constraints by executing highly efficient ML inference.
