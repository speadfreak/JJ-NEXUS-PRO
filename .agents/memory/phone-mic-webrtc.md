---
name: Phone mic via WebRTC
description: AirPods don't work as mic on Chromebook; solution is phone WebRTC audio stream routed to BrowserStreamEngine.
---

## Rule
AirPods (and most BT headsets) fail as mic inputs on ChromeOS because Apple's HFP profile isn't fully supported. The fix: connect AirPods to the iPhone/Android, use the phone camera page (which captures AirPods audio via getUserMedia), and route that WebRTC audio stream into BrowserStreamEngine instead of calling getUserMedia on Chromebook.

**Why:** Apple's Bluetooth mic mode (HFP) only works reliably on Apple hardware. Chromebook sees the AirPods but cannot switch to mic mode without the connection dropping.

**How to apply:**
- `CameraContext.phoneStream` includes audio tracks from the phone's mic (including AirPods if connected to phone)
- `BrowserStreamEngine.setExternalMicStream(stream)` sets the highest-priority mic source — skips all getUserMedia calls
- `AudioInputPanel` in `StreamingCommandCenter` has a "Use Phone Mic" toggle that calls `setExternalMicStream`
- `phone-camera.html` uses `echoCancellation: true, noiseSuppression: true, autoGainControl: true, sampleRate: 48000` audio constraints for clean phone audio
- The audio device selector on the phone page lets users explicitly pick AirPods when they appear in the list

## Navigation disconnect fix
`PhoneCameraConnect` is mounted inside `StreamingStudio`. When user navigates away, the component unmounts and its `initiated` ref is destroyed. On remount, the old code called `startSession()` which created a NEW session and destroyed the existing WebRTC connection.

Fix: on mount, check `phoneState` from CameraContext. If `connected` or `waiting`, just restore the QR/URL display without creating a new session.

## Auto-reconnect
- Webapp side: `PhoneCameraConnect` watches `phoneState === 'error'` and auto-retries `connectPhoneCamera(sameSessionId)` up to 3 times at 2.5s intervals
- Phone side: `phone-camera.html` `onconnectionstatechange` handler re-posts offer on same sessionId after 3s timeout
- Both sides use the SAME session ID so no QR rescan is needed
