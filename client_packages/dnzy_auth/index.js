// ======================================
// DNZY RP — AUTH CAMERA (CLIENT) — GLOBAL
// globalThis.DNZY_AUTH.startAuthCamera()
// globalThis.DNZY_AUTH.stopAuthCamera()
// - Pan yavaş (18-22sn)
// - Manzara 15sn'de bir sırayla değişir
// - Auth ekranında LOD/stream daha iyi: setFocus + setHdArea
// ======================================

let authCam = null;
let authActive = false;

// Pan state
let panStartMs = 0;
let panDurationMs = 20000; // 18–22sn arası ayarlanacak
let baseRot = null;
let yawAmplitude = 18;     // derece
let pitchAmplitude = 1.8;  // derece

// Manzara geçiş state
let currentIndex = -1;
let lastSwitchMs = 0;
const CHANGE_INTERVAL = 15000; // 15sn'de bir yeni manzara

// HD/Focus state (LOD fix)
let hdActive = false;
let lastHdPos = null;

// Manzara listesi
const camLocations = [
  { pos: new mp.Vector3(712.0, 1194.0, 360.0),   rot: new mp.Vector3(-10, 0, 210), fov: 60 },
  { pos: new mp.Vector3(-415.0, 1172.0, 330.0),  rot: new mp.Vector3(-12, 0, 135), fov: 60 },
  { pos: new mp.Vector3(-1565.6, -1134.4, 80.0), rot: new mp.Vector3(-8, 0, 20),   fov: 60 },
  { pos: new mp.Vector3(-75.0, -818.0, 360.0),   rot: new mp.Vector3(-12, 0, -40), fov: 60 },
  { pos: new mp.Vector3(-1336.0, -3044.0, 210.0),rot: new mp.Vector3(-12, 0, 60),  fov: 60 },
  { pos: new mp.Vector3(620.0, 750.0, 320.0),    rot: new mp.Vector3(-10, 0, 120), fov: 60 },
  { pos: new mp.Vector3(-155.0, 6450.0, 160.0),  rot: new mp.Vector3(-12, 0, 180), fov: 60 },
];

function nextCamLocation() {
  if (!camLocations.length) {
    return { pos: new mp.Vector3(-1565.6, -1134.4, 40.0), rot: new mp.Vector3(0, 0, 0), fov: 60 };
  }
  currentIndex = (currentIndex + 1) % camLocations.length;
  return camLocations[currentIndex];
}

function startPan(rotVec) {
  panStartMs = Date.now();

  // ✅ Pan yavaş: 18–22sn
  panDurationMs = 18000 + Math.floor(Math.random() * 4001);

  baseRot = new mp.Vector3(rotVec.x, rotVec.y, rotVec.z);

  // küçük sinematik varyasyon
  yawAmplitude = 8 + Math.random() * 10;       // 8–18
  pitchAmplitude = 0.6 + Math.random() * 1.0;  // 0.6–1.6
}

function applyHdFocus(pos) {
  // LOD için focus + HD area (çok abartmadan)
  lastHdPos = pos;

  try { mp.game.streaming.setFocusArea(pos.x, pos.y, pos.z, 0.0, 0.0, 0.0); } catch (e) {}
  try { mp.game.streaming.setHdArea(pos.x, pos.y, pos.z, 100.0); } catch (e) {} // radius
  hdActive = true;
}

function clearHdFocus() {
  if (!hdActive) return;

  try { mp.game.streaming.clearFocus(); } catch (e) {}
  try { mp.game.streaming.clearHdArea(); } catch (e) {}

  hdActive = false;
  lastHdPos = null;
}

function applyLocation(loc) {
  if (!authCam) return;

  // Kamerayı yeni konuma al
  try { authCam.setCoord(loc.pos.x, loc.pos.y, loc.pos.z); } catch (e) {}

  // FOV (varsa)
  try { authCam.setFov(loc.fov || 60); } catch (e) {}

  // LOD focus
  applyHdFocus(loc.pos);

  // Pan reset
  startPan(loc.rot);
}

// Render: look disable + pan + manzara switch
mp.events.add("render", () => {
  if (!authActive) return;

  // Kamera oynatma kapalı (mouse look)
  mp.game.controls.disableControlAction(0, 1, true);
  mp.game.controls.disableControlAction(0, 2, true);
  mp.game.controls.disableControlAction(0, 3, true);
  mp.game.controls.disableControlAction(0, 4, true);
  mp.game.controls.disableControlAction(0, 5, true);
  mp.game.controls.disableControlAction(0, 6, true);
  mp.game.controls.disableControlAction(0, 25, true);
  mp.game.controls.disableControlAction(0, 68, true);

  if (!authCam || !baseRot) return;

  const now = Date.now();

  // ✅ 15sn’de bir sırayla yeni manzara
  if (now - lastSwitchMs >= CHANGE_INTERVAL) {
    lastSwitchMs = now;
    const loc = nextCamLocation();
    applyLocation(loc);
  }

  // ✅ Pan hesabı
  let t = (now - panStartMs) / panDurationMs;
  if (t >= 1) {
    // aynı sahnede pan döngüsü biterse sadece panı resetle
    startPan(baseRot);
    t = 0;
  }

  const s = Math.sin(t * Math.PI * 2);
  const yaw = baseRot.z + (s * yawAmplitude);
  const pitch = baseRot.x + (Math.sin(t * Math.PI) * pitchAmplitude);

  // En garanti rot uygulama
  try {
    mp.game.cam.setCamRot(authCam.handle, pitch, baseRot.y, yaw, 2);
  } catch (e) {
    try { authCam.setRot(pitch, baseRot.y, yaw, 2); } catch (e2) {}
  }
});

function startAuthCamera() {
  authActive = true;

  // index reset + timer reset
  currentIndex = -1;
  lastSwitchMs = 0;

  // Kamera varsa temizle
  if (authCam) {
    try { authCam.setActive(false); } catch (e) {}
    try { authCam.destroy(); } catch (e) {}
    authCam = null;
  }

  // İlk lokasyon
  const loc = nextCamLocation();

  authCam = mp.cameras.new("default", loc.pos, loc.rot, loc.fov || 60);
  authCam.setActive(true);
  mp.game.cam.renderScriptCams(true, false, 0, true, false);

  // LOD focus
  applyHdFocus(loc.pos);

  // Pan başlat
  startPan(loc.rot);

  // İlk switch time şimdi
  lastSwitchMs = Date.now();

  // ped gizle
  mp.players.local.setAlpha(0);

  return true;
}

function stopAuthCamera() {
  authActive = false;

  if (authCam) {
    try { authCam.setActive(false); } catch (e) {}
    try { mp.game.cam.renderScriptCams(false, false, 0, true, false); } catch (e) {}
    try { authCam.destroy(); } catch (e) {}
    authCam = null;
  }

  clearHdFocus();

  baseRot = null;
  currentIndex = -1;
  lastSwitchMs = 0;

  return true;
}

// ✅ GLOBAL API
globalThis.DNZY_AUTH = {
  startAuthCamera,
  stopAuthCamera
};
