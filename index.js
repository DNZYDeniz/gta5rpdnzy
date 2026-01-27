// ======================================
// DNZY RP — Character Creator (CLIENT) — FULL FIXED
// - Michael House Creator + Stable Front Cam
// - RMB rotate (creator)
// - Selector UI: Cursor ON, Camera NOT rotating
// - HUD hide: RageMP compatible (no hideHudAndRadarThisFrame)
// - Single render loop (no conflicts)
// ======================================

"use strict";

let creatorCam = null;
const localPlayer = mp.players.local;

let charBrowser = null;
let spawnBrowser = null;

let currentGender = "ERKEK";
let currentBeard = 0;
let currentBeardColor = 0;
let currentBrows = 0;
let currentBrowColor = 0;
let currentEyeliner = 0;
let currentEyelinerColor = 0;
let currentEyeShadow = 0;
let currentEyeShadowColor = 0;

// UYUMLU ID LİSTELERİ
const maleTops = [1, 7, 10, 13, 22, 26, 31, 54, 94, 131];
const femaleTops = [1, 5, 7, 10, 11, 15, 25, 48, 57, 100];
const maleLegs = [1, 4, 10, 12, 22, 24];
const femaleLegs = [1, 3, 4, 6, 11, 15];
const maleShoes = [1, 6, 12, 14, 20];
const femaleShoes = [1, 5, 13, 19, 20];
const SELECTOR_CAM_TUNE = {
  dist: 2.2,
  side: 0.8,
  height: 0.9,
  lookH: 0.35,
  fov: 28.0
};
// Michael House interior için güvenli koordinat
const MICHAEL_INT_POS = new mp.Vector3(-802.3, 175.0, 72.8);

// ------------------------------
// CAMERA TUNING (BURADAN AYARLA)
// ------------------------------
const CAM_TUNE = {
  body: { dist: 2.20, camH: 0.40, lookH: 0.22, fov: 36, side: 0.00 },
  head: { dist: 0.95, camH: 0.52, lookH: 0.68, fov: 28, side: 0.00 },
  feet: { dist: 1.25, camH: 0.16, lookH: -0.70, fov: 26, side: 0.00 },
};

let currentCamMode = "body"; // "body" | "head" | "feet"

// ======================================
// Selector (Character Select Screen)
// ======================================
let selectorBrowser = null;
let selectorCam = null;
let inSelectorMode = false;
let customObjectHandle = null;

// KOORDİNATLAR
const SELECTOR_POS = { x: -1953.62, y: -727.82, z: 3.77, h: 220.0 };
const SELECTOR_CAM_POS = { x: -1955.8, y: -730.5, z: 4.2 };
const PROP_POS = { x: -1952.2, y: -727.5, z: 3.6 };
const PROP_NAME = "dnzydekor"; // spawn edeceğin model adı

// --------------------------------------------------
// Helpers
// --------------------------------------------------

// --------------------------------------------------
// SAFE HELPERS: clamp + "YOK" (-1) -> overlay 255
// --------------------------------------------------
function clampInt(v, min, max, def = min) {
  const n = parseInt(v);
  if (!Number.isFinite(n)) return def;
  return Math.max(min, Math.min(max, n));
}

// GTA: overlay seçenek sayısını native'den al (RageMP invoke)
function getOverlayMax(overlayId) {
  try {
    // GET_NUM_HEAD_OVERLAY_VALUES
    return mp.game.invoke("0xCF1CE768BB43480E", overlayId) || 0;
  } catch (e) {
    return 0;
  }
}

// UI tarafında -1 = YOK, oyun tarafında 255 = NONE
function normalizeOverlayIndex(raw, overlayId) {
  const n = parseInt(raw);
  if (!Number.isFinite(n) || n < 0) return -1;

  const max = getOverlayMax(overlayId); // ör: eyeliner vs
  if (max > 0 && n >= max) return -1;  // aralık dışıysa YOK
  return n;
}

function setOverlaySafe(ped, overlayId, rawIndex, rawColor) {
  const idx = normalizeOverlayIndex(rawIndex, overlayId);

  if (idx === -1) {
    try { ped.setHeadOverlay(overlayId, 255, 0.0, 0, 0); } catch (e) {}
    return -1;
  }

  const color = clampInt(rawColor, 0, 63, 0);
  try { ped.setHeadOverlay(overlayId, idx, 1.0, color, 0); } catch (e) {}
  return idx;
}

// data.appearance string/object fark etmez, UI'ya güvenli hale getirir
function sanitizeAppearance(app) {
  let a = app;
  try { a = (typeof app === "string") ? JSON.parse(app) : app; } catch (e) { a = {}; }
  if (!a || typeof a !== "object") a = {};

  // overlay id'ler: beard=1, brows=2, eyeliner=4, eyeshadow=5
  a.beard         = normalizeOverlayIndex(a.beard, 1);
  a.brows         = normalizeOverlayIndex(a.brows, 2);
  a.eyeliner      = normalizeOverlayIndex(a.eyeliner, 4);
  a.eyeshadow     = normalizeOverlayIndex(a.eyeshadow, 5);

  a.beard_color   = clampInt(a.beard_color, 0, 63, 0);
  a.brows_color   = clampInt(a.brows_color, 0, 63, 0);
  a.eyeliner_color= clampInt(a.eyeliner_color, 0, 63, 0);
  a.eyeshadow_color=clampInt(a.eyeshadow_color, 0, 63, 0);

  // hair renk negatifse 0'a çek
  a.hair_color    = clampInt(a.hair_color, 0, 63, 0);

  return a;
}



function getGroundZSafe(x, y, z) {
  // z'yi yukarıdan taramak daha stabil
  const probeZ = z + 50.0;

  // Wiki: getGroundZFor3dCoord(x,y,z, waterAsGround, waterLevelCheck) :contentReference[oaicite:1]{index=1}
  let r;
  try {
    r = mp.game.gameplay.getGroundZFor3dCoord(x, y, probeZ, true, false);
  } catch (e) {
    return null;
  }

  // RageMP build’ine göre dönüş tipi değişebiliyor: number / [bool,z] / {0:bool,1:z}
  if (typeof r === "number") return r;

  if (Array.isArray(r)) {
    const ok = !!r[0];
    const gz = Number(r[1]);
    return ok && Number.isFinite(gz) ? gz : null;
  }

  if (r && typeof r === "object") {
    const ok = !!r[0];
    const gz = Number(r[1]);
   return ok && Number.isFinite(gz) ? gz : null;
  }

  return null;
}

function settlePlayerOnGround(player, tries = 80) {
  const x = SELECTOR_POS.x;
  const y = SELECTOR_POS.y;
  const baseZ = SELECTOR_POS.z;
try { mp.game.entity.setEntityVelocity(player.handle, 0.0, 0.0, 0.0); } catch(e) {}
  // Freeze açıkken düşmez. Önce serbest bırak.
  player.freezePosition(false);

  // Collision kesin açık olsun
  try { mp.game.entity.setEntityCollision(player.handle, true, true); } catch (e) {}

  // Biraz yukarıdan başlat (zemine gömülmesin)
  try {
    mp.game.invoke("0x239A3351AC1DA385", player.handle, x, y, baseZ + 1.0, false, false, false); // SET_ENTITY_COORDS_NO_OFFSET
  } catch (e) {
    player.position = new mp.Vector3(x, y, baseZ + 1.0);
  }

  let attempt = 0;
  const t = setInterval(() => {
    attempt++;

    // Collision'u sürekli iste (özellikle sahil/LOD bölgelerinde şart)
    mp.game.streaming.requestCollisionAtCoord(x, y, baseZ);
    try { mp.game.streaming.requestAdditionalCollisionAtCoord(x, y, baseZ); } catch (e) {}

    // Raycast ile gerçek zemini bul
    const from = new mp.Vector3(x, y, baseZ + 50.0);
    const to   = new mp.Vector3(x, y, baseZ - 50.0);
    const hit = mp.raycasting.testPointToPoint(from, to, player, 1); // 1 = map/ground

    if (hit && hit.position) {
      clearInterval(t);

      const gz = hit.position.z;

      // Çok minik offset: ayaklar zemine tam otursun
      const finalZ = gz + 0.03;

      try {
        mp.game.invoke("0x239A3351AC1DA385", player.handle, x, y, finalZ, false, false, false);
      } catch (e) {
        player.position = new mp.Vector3(x, y, finalZ);
      }

      // 150-250ms sonra kilitle (otursun diye)
      setTimeout(() => player.freezePosition(true), 200);
      return;
    }

    // Bulamazsa da en fazla tries kadar dene, sonra kilitle
    if (attempt >= tries) {
      clearInterval(t);
      setTimeout(() => player.freezePosition(true), 200);
    }
  }, 50);
}



function notify(msg) {
  try {
    mp.game.ui.setNotificationTextEntry("STRING");
    mp.game.ui.addTextComponentSubstringPlayerName(String(msg));
    mp.game.ui.drawNotification(false, true);
  } catch (e) {}
}

function hideHudThisFrame() {
  // RageMP uyumlu HUD kapatma
  mp.game.ui.displayRadar(false);
  mp.game.ui.hideHudComponentThisFrame(1);
  mp.game.ui.hideHudComponentThisFrame(2);
  mp.game.ui.hideHudComponentThisFrame(3);
  mp.game.ui.hideHudComponentThisFrame(4);
  mp.game.ui.hideHudComponentThisFrame(6);
  mp.game.ui.hideHudComponentThisFrame(7);
  mp.game.ui.hideHudComponentThisFrame(8);
  mp.game.ui.hideHudComponentThisFrame(9);
  mp.game.ui.hideHudComponentThisFrame(13);
  mp.game.ui.hideHudComponentThisFrame(14);
  mp.game.ui.hideHudComponentThisFrame(15);
  mp.game.ui.hideHudComponentThisFrame(16);
  mp.game.ui.hideHudComponentThisFrame(17);
  mp.game.ui.hideHudComponentThisFrame(19);
  mp.game.ui.hideHudComponentThisFrame(20);
  mp.game.ui.hideHudComponentThisFrame(22);
}

function loadSceneAt(pos) {
  mp.game.streaming.requestCollisionAtCoord(pos.x, pos.y, pos.z);
  mp.game.streaming.newLoadSceneStart(pos.x, pos.y, pos.z, pos.x, pos.y, pos.z, 60.0, 0);
  mp.game.streaming.newLoadSceneStartSphere(pos.x, pos.y, pos.z, 60.0, 0);
}

function ensureMichaelInterior() {
  // IPL ismi build’e göre değişebilir; seninki bu şekilde çalışıyordu
  mp.game.streaming.requestIpl("v_michael");
  mp.game.streaming.requestIpl("v_michael_garage");
  mp.game.streaming.requestIpl("v_michael_bed");
  mp.game.streaming.requestIpl("v_michael_lounge");
}

function setCreatorState(enabled) {
  mp.game.ui.displayRadar(!enabled);
  mp.gui.cursor.show(enabled, enabled);

  if (enabled) {
    localPlayer.freezePosition(false);
    localPlayer.setInvincible(true);
  } else {
    localPlayer.freezePosition(false);
    localPlayer.setInvincible(false);
  }
}

function setupCamera() {
  if (selectorCam) selectorCam.destroy();

  const p = mp.players.local.position;
  const h = SELECTOR_POS.h * Math.PI / 180;

  // heading’e göre “arkaya” offset
  const backX = -Math.sin(h) * SELECTOR_CAM_TUNE.dist;
  const backY =  Math.cos(h) * SELECTOR_CAM_TUNE.dist;

  // yana offset
  const sideX =  Math.cos(h) * SELECTOR_CAM_TUNE.side;
  const sideY =  Math.sin(h) * SELECTOR_CAM_TUNE.side;

  const camPos = new mp.Vector3(
    p.x + backX + sideX,
    p.y + backY + sideY,
    p.z + SELECTOR_CAM_TUNE.height
  );

  selectorCam = mp.cameras.new("default", camPos, new mp.Vector3(0, 0, 0), SELECTOR_CAM_TUNE.fov);
  selectorCam.pointAtCoord(p.x, p.y, p.z + SELECTOR_CAM_TUNE.lookH);
  selectorCam.setActive(true);
  mp.game.cam.renderScriptCams(true, false, 0, true, false);

  
}



function cleanUpSelector() {
  inSelectorMode = false;

  if (selectorBrowser) {
    selectorBrowser.destroy();
    selectorBrowser = null;
  }

  if (selectorCam) {
    selectorCam.setActive(false);
    mp.game.cam.renderScriptCams(false, false, 0, true, false);
    selectorCam.destroy();
    selectorCam = null;
  }

  if (customObjectHandle && mp.game.entity.doesEntityExist(customObjectHandle)) {
    try { mp.game.object.deleteObject(customObjectHandle); } catch (e) {}
    customObjectHandle = null;
  }

  mp.players.local.freezePosition(false);
  mp.game.streaming.clearFocus();
}






function createOrUpdateCam(camPos, lookPos, fov) {
  if (!creatorCam) {
    creatorCam = mp.cameras.new("default", camPos, new mp.Vector3(0, 0, 0), fov);
  }
  creatorCam.setCoord(camPos.x, camPos.y, camPos.z);
  creatorCam.pointAtCoord(lookPos.x, lookPos.y, lookPos.z);
  creatorCam.setFov(fov);
  creatorCam.setActive(true);
  mp.game.cam.renderScriptCams(true, false, 0, true, false);
}

function destroyCreatorCam() {
  if (!creatorCam) return;
  creatorCam.setActive(false);
  mp.game.cam.renderScriptCams(false, false, 0, true, false);
  creatorCam.destroy();
  creatorCam = null;
}

function applyFrontCamera(mode) {
  const t = CAM_TUNE[mode] || CAM_TUNE.body;
  const p = localPlayer.position;

  const camPos = new mp.Vector3(p.x + (t.side || 0), p.y - t.dist, p.z + t.camH);
  const lookPos = new mp.Vector3(p.x, p.y, p.z + t.lookH);

  createOrUpdateCam(camPos, lookPos, t.fov);
  facePlayerToCamera();
}

function facePlayerToCamera() {
  if (!creatorCam) return;
  const camPos = creatorCam.getCoord();
  const p = localPlayer.position;

  const dx = p.x - camPos.x;
  const dy = p.y - camPos.y;

  const heading = (Math.atan2(dx, dy) * 180 / Math.PI + 180 + 360) % 360;
  localPlayer.setHeading(heading);
}

function updateCamLookToPlayer() {
  if (!creatorCam) return;
  const t = CAM_TUNE[currentCamMode] || CAM_TUNE.body;
  const p = localPlayer.position;
  creatorCam.pointAtCoord(p.x, p.y, p.z + t.lookH);
}

function applyDefaultClothesForGender() {
  const isMale = (currentGender === "ERKEK");
  applyUnderwearBase(isMale);
}


function cycleIndexWithNone(raw, len) {
  const n = parseInt(raw);
  const L = Math.max(0, len | 0);
  if (!Number.isFinite(n) || L === 0) return 0;
  const mod = (L + 1);
  return ((n % mod) + mod) % mod; // 0..L
}

function applyUnderwearBase(isMale) {
  // GTA: SET_PED_DEFAULT_COMPONENT_VARIATION -> freemode ped'de underwear default verir
  try { mp.game.invoke("0x45EEE61580806D63", localPlayer.handle); } catch (e) {}

  // Bazı buildlerde ekstra güvenlik:
  try { localPlayer.clearProp(0); } catch(e) {}
  try { localPlayer.clearProp(1); } catch(e) {}
  try { localPlayer.clearProp(2); } catch(e) {}

  // Üst/alt "none" gibi davranması için gerekirse undershirt sabitle
  try { localPlayer.setComponentVariation(8, 15, 0, 0); } catch (e) {}
}

// --------------------------------------------------
// Appearance apply (GLOBAL FUNCTION)  ✅
// --------------------------------------------------
function applyAppearanceToPed(ped, appData, clothesData, isFemale) {
  try {
    // appData string gelebilir
    const app = (typeof appData === "string") ? JSON.parse(appData) : appData;
    const clothes = (typeof clothesData === "string") ? JSON.parse(clothesData) : clothesData;

    if (!app && !clothes) return;

    // --- Head blend / face ---
    if (app) {
      const mom = parseInt(app.mom) || 0;
      const dad = parseInt(app.dad) || 0;
      const skin = (parseFloat(app.skin) || 0) / 10;

      try {
        ped.setHeadBlendData(
          mom, dad, 0,
          mom, dad, 0,
          0.5, skin, 0,
          false
        );
      } catch (e) {}

      if (Array.isArray(app.face)) {
        app.face.forEach((val, idx) => {
          try { ped.setFaceFeature(idx, parseFloat(val)); } catch (e) {}
        });
      }

      // Hair
      try { ped.setComponentVariation(2, parseInt(app.hair) || 0, 0, 0); } catch (e) {}
      try {
        const hc = parseInt(app.hair_color) || 0;
        ped.setHairColor(hc, hc);
      } catch (e) {}

      // Overlays
      try {
        const beard = parseInt(app.beard) || 0;
        const beardC = parseInt(app.beard_color) || 0;
        ped.setHeadOverlay(1, beard, 1.0, beardC, 0);
      } catch (e) {}

      try {
        const brows = parseInt(app.brows) || 0;
        const browsC = parseInt(app.brows_color) || 0;
        ped.setHeadOverlay(2, brows, 1.0, browsC, 0);
      } catch (e) {}

      try {
        const eyeliner = parseInt(app.eyeliner) || 0;
        const eyelinerC = parseInt(app.eyeliner_color) || 0;
        ped.setHeadOverlay(4, eyeliner, 1.0, eyelinerC, 0);
      } catch (e) {}

      // Eyeshadow is overlay 5 (istersen UI'da ayrı tut)
      try {
        const eyeshadow = parseInt(app.eyeshadow) || 0;
        const eyeshadowC = parseInt(app.eyeshadow_color) || 0;
        ped.setHeadOverlay(5, eyeshadow, 1.0, eyeshadowC, 0);
      } catch (e) {}

      try { ped.setEyeColor(parseInt(app.eyes) || 0); } catch (e) {}
    }

    // --- Clothes ---
    // top/legs/shoes değerlerini önce clothesData, yoksa app içinden dene
    const topIndex   = (clothes && clothes.top   != null) ? clothes.top   : (app && app.top);
    const legsIndex  = (clothes && clothes.legs  != null) ? clothes.legs  : (app && app.legs);
    const shoesIndex = (clothes && clothes.shoes != null) ? clothes.shoes : (app && app.shoes);

    const tops  = isFemale ? femaleTops  : maleTops;
    const legs  = isFemale ? femaleLegs  : maleLegs;
    const shoes = isFemale ? femaleShoes : maleShoes;

    if (topIndex != null && tops && tops.length) {
      const tId = tops[(parseInt(topIndex) || 0) % tops.length];
      try { ped.setComponentVariation(11, tId, 0, 0); } catch (e) {}
      try { ped.setComponentVariation(8, 15, 0, 0); } catch (e) {}
    }

    if (legsIndex != null && legs && legs.length) {
      const lId = legs[(parseInt(legsIndex) || 0) % legs.length];
      try { ped.setComponentVariation(4, lId, 0, 0); } catch (e) {}
    }

    if (shoesIndex != null && shoes && shoes.length) {
      const sId = shoes[(parseInt(shoesIndex) || 0) % shoes.length];
      try { ped.setComponentVariation(6, sId, 0, 0); } catch (e) {}
    }
  } catch (e) {
    // sessiz geç
  }
}


// --------------------------------------------------
// START CREATOR
// --------------------------------------------------

mp.events.add("client:character:startCreator", () => {
  ensureMichaelInterior();
  loadSceneAt(MICHAEL_INT_POS);

  setTimeout(() => {
    localPlayer.position = MICHAEL_INT_POS;
    localPlayer.setAlpha(255);

    setCreatorState(true);
    applyDefaultClothesForGender();

    currentCamMode = "body";
    try { applyFrontCamera(currentCamMode); } catch (e) {}
    setTimeout(() => { try { facePlayerToCamera(); } catch (e) {} }, 0);
    setTimeout(() => { try { facePlayerToCamera(); } catch (e) {} }, 150);

    if (!charBrowser) {
      charBrowser = mp.browsers.new("package://character/ui/index.html");
    }

    // ✅ UI load sonrası ilk kamerayı BODY'ye kilitle
    setTimeout(() => {
      try { currentCamMode = "body"; } catch (e) {}
      try { applyFrontCamera("body"); } catch (e) {}
      try { facePlayerToCamera(); } catch (e) {}
    }, 450);

  }, 0);
});
// --------------------------------------------------
// UI -> CLIENT EVENTS
// --------------------------------------------------

mp.events.add("client:char:setGender", (g) => {
  currentGender = g;

  const isMale = (g === "ERKEK");
  const model = isMale ? "mp_m_freemode_01" : "mp_f_freemode_01";

  // Server-side model swap
  mp.events.callRemote("server:character:changeModel", model);

  // UI'ya yansıt
  if (charBrowser) {
    charBrowser.execute(`window.__setGender && window.__setGender(${isMale ? `"ERKEK"` : `"KADIN"`});`);
  }

  // Model swap biraz gecikmeli oturuyor -> 2 aşamalı düzeltme
  setTimeout(() => {
    try {
      // ✅ Modelin yüzü kameraya baksın diye heading'i sabitle
      // (Kamera Y eksenine bakıyor: genelde 180 doğru)
      localPlayer.setHeading(180);
    } catch (e) {}

    try {
      if (!isMale) {
        // KADIN default
        localPlayer.setHeadBlendData(45, 34, 0, 45, 34, 0, 0.5, 0.5, 0, false);
        localPlayer.setComponentVariation(2, 15, 0, 0); // saç
        localPlayer.setHairColor(0, 0);

        currentBeard = 0;
        currentBeardColor = 0;
        localPlayer.setHeadOverlay(1, 0, 0.0, 0, 0); // sakal yok
      } else {
        // ERKEK default
        localPlayer.setHeadBlendData(0, 0, 0, 0, 0, 0, 0.5, 0.5, 0, false);
        localPlayer.setComponentVariation(2, 0, 0, 0);
        localPlayer.setHairColor(0, 0);

        currentBeard = 0;
        currentBeardColor = 0;
        localPlayer.setHeadOverlay(1, 0, 1.0, 0, 0); // sakal overlay (senin eski mantık)
      }
    } catch (e) {}

    // ✅ Default kıyafet yerine underwear (sen applyDefaultClothesForGender'i buna çevirmiş olacaksın)
    applyDefaultClothesForGender();

    // ✅ Kamera modunu BODY'ye sabitle (ilk kamera vücut gibi olsun)
    currentCamMode = "body";
    try { applyFrontCamera("body"); } catch (e) {}

    // ✅ Yön düzelt
    try { facePlayerToCamera(); } catch (e) {}
    setTimeout(() => {
      try { localPlayer.setHeading(180); } catch (e) {}
      try { applyFrontCamera("body"); } catch (e) {}
      try { facePlayerToCamera(); } catch (e) {}
    }, 200);

    // ✅ Bir kez daha (model swap bazen 500-700ms'de tam oturuyor)
    setTimeout(() => {
      try { localPlayer.setHeading(180); } catch (e) {}
      try { applyFrontCamera("body"); } catch (e) {}
      try { facePlayerToCamera(); } catch (e) {}
    }, 650);

  }, 250);
});


mp.events.add("client:char:setHeritage", (m, d, s) => {
  localPlayer.setHeadBlendData(
    parseInt(m), parseInt(d), 0,
    parseInt(m), parseInt(d), 0,
    0.5, parseFloat(s) / 10, 0,
    false
  );
});

mp.events.add("client:char:setFaceFeature", (idx, val) => {
  localPlayer.setFaceFeature(parseInt(idx), parseFloat(val));
});

mp.events.add("client:char:updateFeature", (type, value) => {
  const isMale = (currentGender === "ERKEK");

  // güvenli parse (UI bazen string bazen sayı yollar)
  const raw = value;

  switch (type) {
    // ----------------------------
    // HAIR (component 2)
    // -1 = YOK (kel/none)
    // ----------------------------
    case "hair": {
      const h = parseInt(raw);

      // -1 / NaN -> YOK
      if (!Number.isFinite(h) || h < 0) {
        try { localPlayer.setComponentVariation(2, 0, 0, 0); } catch (e) {}
        break;
      }

      // ped’de kaç drawable var? (component 2 = hair)
      let max = 0;
      try {
        // GET_NUMBER_OF_PED_DRAWABLE_VARIATIONS(ped, componentId)
        max = mp.game.invoke("0x27561561732A7842", localPlayer.handle, 2) || 0;
      } catch (e) { max = 0; }

      // aralık dışı -> YOK
      if (max > 0 && h >= max) {
        try { localPlayer.setComponentVariation(2, 0, 0, 0); } catch (e) {}
        break;
      }

      try { localPlayer.setComponentVariation(2, h, 0, 0); } catch (e) {}
      break;
    }

    case "hair_color": {
      const c = clampInt(raw, 0, 63, 0);
      try { localPlayer.setHairColor(c, c); } catch (e) {}
      break;
    }

    // ----------------------------
    // OVERLAYS (YOK destekli)
    // beard=1, brows=2, eyeliner=4, eyeshadow=5
    // ----------------------------
    case "beard": {
      currentBeard = setOverlaySafe(localPlayer, 1, raw, currentBeardColor);
      break;
    }
    case "beard_color": {
      currentBeardColor = clampInt(raw, 0, 63, 0);
      // mevcut beard’i yeniden bas
      currentBeard = setOverlaySafe(localPlayer, 1, currentBeard, currentBeardColor);
      break;
    }

    case "brows": {
      currentBrows = setOverlaySafe(localPlayer, 2, raw, currentBrowColor);
      break;
    }
    case "brows_color": {
      currentBrowColor = clampInt(raw, 0, 63, 0);
      currentBrows = setOverlaySafe(localPlayer, 2, currentBrows, currentBrowColor);
      break;
    }

    case "eyeliner": {
      currentEyeliner = setOverlaySafe(localPlayer, 4, raw, currentEyelinerColor);
      break;
    }
    case "eyeliner_color": {
      currentEyelinerColor = clampInt(raw, 0, 63, 0);
      currentEyeliner = setOverlaySafe(localPlayer, 4, currentEyeliner, currentEyelinerColor);
      break;
    }

    case "eyeshadow": {
      currentEyeShadow = setOverlaySafe(localPlayer, 5, raw, currentEyeShadowColor);
      break;
    }
    case "eyeshadow_color": {
      currentEyeShadowColor = clampInt(raw, 0, 63, 0);
      currentEyeShadow = setOverlaySafe(localPlayer, 5, currentEyeShadow, currentEyeShadowColor);
      break;
    }

    // ----------------------------
    // EYE COLOR
    // ----------------------------
    case "eyes": {
      const e = clampInt(raw, 0, 31, 0);
      try { localPlayer.setEyeColor(e); } catch (e2) {}
      break;
    }

    // ----------------------------
    // CLOTHES (list üzerinden)
    // ----------------------------
    case "top": {
      const arr = isMale ? maleTops : femaleTops;
      const c = cycleIndexWithNone(raw, arr.length);

      if (c === 0) {
        applyUnderwearBase(isMale);
        break;
      }

      const tId = arr[c - 1];
      try { localPlayer.setComponentVariation(11, tId, 0, 0); } catch (e) {}
      try { localPlayer.setComponentVariation(8, 15, 0, 0); } catch (e) {}
      break;
    }

    case "legs": {
      const arr = isMale ? maleLegs : femaleLegs;
      const c = cycleIndexWithNone(raw, arr.length);

      if (c === 0) {
        applyUnderwearBase(isMale);
        break;
      }

      const lId = arr[c - 1];
      try { localPlayer.setComponentVariation(4, lId, 0, 0); } catch (e) {}
      break;
    }

    case "shoes": {
      const arr = isMale ? maleShoes : femaleShoes;
      const c = cycleIndexWithNone(raw, arr.length);

      if (c === 0) {
        applyUnderwearBase(isMale);
        break;
      }

      const sId = arr[c - 1];
      try { localPlayer.setComponentVariation(6, sId, 0, 0); } catch (e) {}
      break;
    }


mp.events.add("client:char:setCamera", (t) => {
  if (!creatorCam) return;

  if (t === "head") currentCamMode = "head";
  else if (t === "feet") currentCamMode = "feet";
  else currentCamMode = "body";

  applyFrontCamera(currentCamMode);
});

// Finish -> Save
mp.events.add("client:char:finish", (name, surname, age, gender, appDataJson) => {
  try {
    const dbGender = (gender === "KADIN" || gender === "female") ? "female" : "male";
    mp.events.callRemote("server:character:save",
      name,
      surname,
      parseInt(age),
      dbGender,
      appDataJson
    );
  } catch (e) {
    if (charBrowser) {
      charBrowser.execute(`console.error("Client Hatası: ${String(e.message || e)}");`);
    }
  }
});

// Unlock UI
mp.events.add("client:char:unlockUI", () => {
  if (charBrowser) {
    charBrowser.execute(`unlockCreateButton()`);
  }
});

// --------------------------------------------------
// Spawn Menu
// --------------------------------------------------

mp.events.add("client:character:showSpawnMenu", (hasHouse, hasFamily) => {
  if (charBrowser) {
    charBrowser.destroy();
    charBrowser = null;
  }
  destroyCreatorCam();

  spawnBrowser = mp.browsers.new("package://character/ui/spawn.html");

  mp.gui.cursor.show(true, true);
  localPlayer.freezePosition(true);

  setTimeout(() => {
    if (spawnBrowser) {
      spawnBrowser.execute(`setOptions(${hasHouse}, ${hasFamily})`);
    }
  }, 500);
});

mp.events.add("client:character:selectSpawn", (type) => {
  if (spawnBrowser) {
    spawnBrowser.destroy();
    spawnBrowser = null;
  }

  setCreatorState(false);
  localPlayer.freezePosition(false);
  mp.game.cam.renderScriptCams(false, false, 0, true, false);

  // Chat'i açma (siyah kutu dönmesin diye)
  mp.gui.chat.show(false);
  mp.gui.chat.activate(false);

  mp.events.callRemote("server:character:spawnFinal", type);
});

mp.events.add("client:char:showError", (message) => {
  if (charBrowser) {
    charBrowser.execute(`showAlert("${String(message).replace(/"/g, '\\"')}")`);
  }
});

// ==========================================
// --- KARAKTER SEÇİM EKRANI (SELECTOR)
// ==========================================

mp.events.add("client:character:startSelector", (rawData) => {
  cleanUpSelector();
  inSelectorMode = true;

  // ✅ First-person / idle cam kill (hemen girişte)
  mp.game.invoke("0xF4F2C0D4EE209E20"); // InvalidateIdleCam
  mp.game.invoke("0x9E4CFFF989258472"); // DisableIdleCam

  // ✅ View mode'u 3rd person'a zorla
  try {
    mp.game.cam.setFollowPedCamViewMode(1);
    mp.game.cam.setFollowVehicleCamViewMode(1);
  } catch (e) {}

  let data = {};
  try { data = (typeof rawData === "string") ? JSON.parse(rawData) : rawData; }
  catch (e) {}
if (data && data.appearance !== undefined) {
  data.appearance = sanitizeAppearance(data.appearance);
}
   const player = mp.players.local;

  // Önce serbest bırak (collision/ground otursun)
  player.freezePosition(false);
  player.setInvincible(true);
  player.setAlpha(255);

  // Pozisyonu hafif yukarıdan ver (zemine gömülmesin)
  try {
    mp.game.invoke("0x239A3351AC1DA385", player.handle,
      SELECTOR_POS.x, SELECTOR_POS.y, SELECTOR_POS.z + 1.0,
      false, false, false
    ); // SET_ENTITY_COORDS_NO_OFFSET
  } catch (e) {
    player.position = new mp.Vector3(SELECTOR_POS.x, SELECTOR_POS.y, SELECTOR_POS.z + 1.0);
  }

  player.setHeading(SELECTOR_POS.h);
  mp.game.streaming.requestCollisionAtCoord(SELECTOR_POS.x, SELECTOR_POS.y, SELECTOR_POS.z);
  loadSceneAt(new mp.Vector3(SELECTOR_POS.x, SELECTOR_POS.y, SELECTOR_POS.z));
  mp.game.streaming.setFocusArea(SELECTOR_POS.x, SELECTOR_POS.y, SELECTOR_POS.z, 0.0, 0.0, 0.0);

  // Collision biraz toplansın, sonra raycast ile yere oturt
  setTimeout(() => {
    settlePlayerOnGround(player);
  }, 350);
  // Obje yükle
  const propHash = mp.game.joaat(PROP_NAME);

  // Chat kapalı olsa bile gör diye notification bas
  const inCd = mp.game.streaming.isModelInCdimage(propHash);
  notify(`PROP ${PROP_NAME} CDIMAGE: ${inCd ? "YES" : "NO"}`);

  // İstersen chat’i kısa süre açık göster (debug)
  // mp.gui.chat.show(true); mp.gui.chat.activate(true);
  // mp.gui.chat.push(`PROP ${PROP_NAME} CDIMAGE: ${inCd}`);

  if (!inCd) {
    // Model pack yüklenmemiş / model adı yanlış
    notify(`KRITIK: Model bulunamadi: ${PROP_NAME}`);
  } else {
    mp.game.streaming.requestModel(propHash);

    let attempts = 0;
    const loadInt = setInterval(() => {
      attempts++;

      if (mp.game.streaming.hasModelLoaded(propHash)) {
        clearInterval(loadInt);

        // Native obje oluştur
        customObjectHandle = mp.game.object.createObject(
          propHash,
          PROP_POS.x, PROP_POS.y, PROP_POS.z,
          false, false, false
        );

        if (customObjectHandle) {
          mp.game.entity.setEntityHeading(customObjectHandle, 220.0);
          mp.game.entity.setEntityAlpha(customObjectHandle, 255, false);
          mp.game.object.placeObjectOnGroundProperly(customObjectHandle);
          notify("Obje olusturuldu ✅");
        } else {
          notify("Obje handle olusmadi ❌");
        }
      }

      if (attempts > 120) { // ~6 saniye
        clearInterval(loadInt);
        notify("Model load timeout ❌");
      }
    }, 50);
  }

  
    // Appearance apply (isFemale tespiti)
  const isFemale = !!(data && (
    data.gender === "female" ||
    data.gender === "KADIN" ||
    data.dbGender === "female"
  ));

  // ✅ Güvenli: appearance/clothes bazen string bazen object bazen boş gelebilir
  const safeAppearance = (data && data.appearance !== undefined) ? data.appearance : null;
  const safeClothes    = (data && data.clothes    !== undefined) ? data.clothes    : null;

  if (data) applyAppearanceToPed(player, safeAppearance, safeClothes, isFemale);

  // ✅ Duruş düzelt: task temizle + sabit dur (syntax fix)
  setTimeout(() => {
    try { mp.game.invoke("0xAAA34F8A7CB32098", player.handle); } catch (e) {} // CLEAR_PED_TASKS_IMMEDIATELY
    try { player.taskStandStill(-1); } catch (e) {}
  }, 400);

  // Kamera
  setupCamera();

  // UI
  setTimeout(() => {
    selectorBrowser = mp.browsers.new("package://character/ui/selector.html");

    // Cursor kesin açık
    mp.gui.cursor.show(true, true);

    if (selectorBrowser && data) {
      selectorBrowser.execute(`setInfo(decodeURIComponent('${encodeURIComponent(JSON.stringify(data))}'))`);
    }
  }, 200);


});



// --------------------------------------------------
// SINGLE RENDER LOOP (NO CONFLICTS)
// --------------------------------------------------
// --------------------------------------------------
// SINGLE RENDER LOOP (NO CONFLICTS)
// --------------------------------------------------
mp.events.add("render", () => {

  // 1) Selector Mode: Cursor ON, NO CAMERA ROTATION
  if (inSelectorMode) {
    // Cursor kesin açık + CEF’e focus
    mp.gui.cursor.show(true, true);

    // Tüm kontrolleri kapat
    mp.game.controls.disableAllControlActions(0);

    // --- UI / CEF click whitelist ---
    mp.game.controls.enableControlAction(0, 24, true);  // LMB
    mp.game.controls.enableControlAction(0, 25, true);  // RMB
    mp.game.controls.enableControlAction(0, 18, true);  // ENTER
    mp.game.controls.enableControlAction(0, 201, true); // FRONTEND_ACCEPT
    mp.game.controls.enableControlAction(0, 176, true); // SELECT/ACCEPT
    mp.game.controls.enableControlAction(0, 237, true); // CURSOR_ACCEPT
    mp.game.controls.enableControlAction(0, 238, true); // CURSOR_CANCEL

    // AFK / idle cam kill (her frame)
    mp.game.invoke("0xF4F2C0D4EE209E20"); // InvalidateIdleCam
    mp.game.invoke("0x9E4CFFF989258472"); // DisableIdleCam

    hideHudThisFrame();

    // ✅ Script cam'i her frame kilitle
    if (selectorCam) {
      if (!selectorCam.isActive()) selectorCam.setActive(true);

      const p = mp.players.local.position;
      selectorCam.pointAtCoord(p.x, p.y, p.z + SELECTOR_CAM_TUNE.lookH);

      mp.game.cam.renderScriptCams(true, false, 0, true, false);
    }

    return; // ✅ selector modunda burada BİTER
  }

  // 2) Creator / Spawn UI aktifse: cursor açık, RMB rotate çalışsın
  const uiActive = !!(creatorCam || charBrowser || spawnBrowser);
  if (uiActive) {
    mp.gui.cursor.show(true, true);

    mp.game.controls.disableAllControlActions(0);

    // LOOK + RMB sadece creator’da heading hesabı için
    mp.game.controls.enableControlAction(0, 1, true);  // LOOK_LR
    mp.game.controls.enableControlAction(0, 2, true);  // LOOK_UD
    mp.game.controls.enableControlAction(0, 25, true); // RMB

    const aiming = mp.game.controls.isControlPressed(0, 25);
    if (creatorCam) {
      if (aiming) {
        const mx = mp.game.controls.getDisabledControlNormal(0, 1);
        const newHeading = (localPlayer.getHeading() + mx * 140) % 360;
        localPlayer.setHeading(newHeading);
        updateCamLookToPlayer();
      } else {
        facePlayerToCamera();
        updateCamLookToPlayer();
      }
    }

    hideHudThisFrame();
    return;
  }
});
