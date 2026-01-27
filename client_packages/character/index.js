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
const maleTops = [1, 9, 13, 47, 57];
const femaleTops = [1, 23, 71, 27, 75];
const maleLegs = [1, 4, 12, 37, 71];
const femaleLegs = [1, 8, 31, 50, 6];
const maleShoes = [1, 10, 63];
const femaleShoes = [1, 4, 30];

// ------------------------------
// LIMITLER (UI döngüsü / wrap)
// 0 = NONE / YOK, 1..MAX = seçenek
// ------------------------------
const MAX_HAIR_CHOICES = 80;
const MAX_BEARD_CHOICES = 28;   // sadece erkek
const MAX_BROWS_CHOICES = 30;
const MAX_EYE_COLOR = 14;       // 0..13
const MAX_EYELINER_CHOICES = 15; // 0 NONE, 1..15 -> overlay 0..14
const MAX_EYESHADOW_CHOICES = 4; // 0 NONE, 1..4 -> overlay 0..3

// Kıyafet state (0 NONE, 1..N array index)
let currentTopChoice = 0;
let currentLegChoice = 0;
let currentShoeChoice = 0;
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

// UI her zaman "choice" yollar:
// 0 = NONE, 1..maxChoices = seçenek (içeride 0..maxChoices-1 kullanır)
function cycleChoiceWithNone(raw, maxChoices) {
  let n = parseInt(raw);
  if (!Number.isFinite(n)) n = 0;
  const span = maxChoices + 1;
  n = ((n % span) + span) % span;
  return n;
}

function overlayChoiceToIndex(choice, maxChoices) {
  const c = cycleChoiceWithNone(choice, maxChoices);
  if (c === 0) return 255;      // NONE
  return c - 1;                 // 1..max => 0..max-1
}

function setOverlayChoice(ped, overlayId, choice, color, maxChoices) {
  const idx = overlayChoiceToIndex(choice, maxChoices);
  const col = clampInt(color, 0, 63, 0);

  try {
    if (idx === 255) ped.setHeadOverlay(overlayId, 255, 0.0, 0, 0);
    else ped.setHeadOverlay(overlayId, idx, 1.0, col, 0);
  } catch (e) {}

  return (idx === 255) ? 0 : (idx + 1); // geri: choice formatında
}

function setHairChoice(ped, choice) {
  // choice: 0 NONE (kel), 1..MAX_HAIR_CHOICES => drawable 0..MAX-1
  const c = cycleChoiceWithNone(choice, MAX_HAIR_CHOICES);
  let drawable = (c === 0) ? 0 : (c - 1);

  // ped’de kaç drawable var? (component 2 = hair)
  let max = 0;
  try { max = mp.game.invoke("0x27561561732A7842", ped.handle, 2) || 0; } catch (e) { max = 0; }
  if (max > 0 && drawable >= max) drawable = 0;

  try { ped.setComponentVariation(2, drawable, 0, 0); } catch (e) {}
  return c;
}

// data.appearance string/object fark etmez, UI'ya güvenli hale getirir
function sanitizeAppearance(app) {
  let a = app;
  try { a = (typeof app === "string") ? JSON.parse(app) : app; } catch (e) { a = {}; }
  if (!a || typeof a !== "object") a = {};

  // overlays: choice formatı (0 NONE)
  a.beard     = cycleChoiceWithNone(a.beard, MAX_BEARD_CHOICES);
  a.brows     = cycleChoiceWithNone(a.brows, MAX_BROWS_CHOICES);
  a.eyeliner  = cycleChoiceWithNone(a.eyeliner, MAX_EYELINER_CHOICES);
  a.eyeshadow = cycleChoiceWithNone(a.eyeshadow, MAX_EYESHADOW_CHOICES);

  a.beard_color    = clampInt(a.beard_color, 0, 63, 0);
  a.brows_color    = clampInt(a.brows_color, 0, 63, 0);
  a.eyeliner_color = clampInt(a.eyeliner_color, 0, 63, 0);
  a.eyeshadow_color= clampInt(a.eyeshadow_color, 0, 63, 0);

  // hair choice + renk
  a.hair       = cycleChoiceWithNone(a.hair, MAX_HAIR_CHOICES);
  a.hair_color = clampInt(a.hair_color, 0, 63, 0);

  // eyes: 0..13
  a.eyes = clampInt(a.eyes, 0, MAX_EYE_COLOR - 1, 0);

  // clothes: choice formatı (0 NONE)
  a.top   = cycleChoiceWithNone(a.top, (Array.isArray(maleTops) ? maleTops.length : 5));
  a.legs  = cycleChoiceWithNone(a.legs, (Array.isArray(maleLegs) ? maleLegs.length : 5));
  a.shoes = cycleChoiceWithNone(a.shoes, (Array.isArray(maleShoes) ? maleShoes.length : 3));

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
  // UI modunda: HUD/Radar kapalı + cursor açık + hareket kilitli
  try { mp.game.ui.displayRadar(!enabled); } catch (e) {}
  try { mp.game.ui.displayHud(!enabled); } catch (e) {}
  try { mp.gui.cursor.show(enabled, enabled); } catch (e) {}

  try { localPlayer.freezePosition(!!enabled); } catch (e) {}
  try { localPlayer.setInvincible(!!enabled); } catch (e) {}
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

function applyClothesFromState(isMale) {
  // Her seferinde underwear tabanından başla (temiz & stabil)
  applyUnderwearBase(isMale);

  const tops = isMale ? maleTops : femaleTops;
  const legs = isMale ? maleLegs : femaleLegs;
  const shoes = isMale ? maleShoes : femaleShoes;

  if (currentTopChoice > 0 && currentTopChoice <= tops.length) {
    const topId = tops[currentTopChoice - 1];
    try { localPlayer.setComponentVariation(11, topId, 0, 0); } catch (e) {}
    try { localPlayer.setComponentVariation(8, 15, 0, 0); } catch (e) {}
  }

  if (currentLegChoice > 0 && currentLegChoice <= legs.length) {
    const legId = legs[currentLegChoice - 1];
    try { localPlayer.setComponentVariation(4, legId, 0, 0); } catch (e) {}
  }

  if (currentShoeChoice > 0 && currentShoeChoice <= shoes.length) {
    const shoeId = shoes[currentShoeChoice - 1];
    try { localPlayer.setComponentVariation(6, shoeId, 0, 0); } catch (e) {}
  }
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

      // Hair (choice format)
      try { setHairChoice(ped, app.hair); } catch (e) {}
      try {
        const hc = parseInt(app.hair_color) || 0;
        ped.setHairColor(hc, hc);
      } catch (e) {}

      // Overlays (choice format: 0 NONE)
      try {
        const bc = parseInt(app.beard_color) || 0;
        setOverlayChoice(ped, 1, app.beard, bc, MAX_BEARD_CHOICES);
      } catch (e) {}

      try {
        const brc = parseInt(app.brows_color) || 0;
        setOverlayChoice(ped, 2, app.brows, brc, MAX_BROWS_CHOICES);
      } catch (e) {}

      try {
        const elc = parseInt(app.eyeliner_color) || 0;
        setOverlayChoice(ped, 4, app.eyeliner, elc, MAX_EYELINER_CHOICES);
      } catch (e) {}

      try {
        const esc = parseInt(app.eyeshadow_color) || 0;
        setOverlayChoice(ped, 5, app.eyeshadow, esc, MAX_EYESHADOW_CHOICES);
      } catch (e) {}

      try { ped.setEyeColor(clampInt(app.eyes, 0, MAX_EYE_COLOR - 1, 0)); } catch (e) {}
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
      // UI: 0 NONE, 1..MAX
      const choice = setHairChoice(localPlayer, raw);
      // saç seçilmediyse de color yine uygulanabilir (oyuncu sonra seçerse)
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
      currentBeard = setOverlayChoice(localPlayer, 1, raw, currentBeardColor, MAX_BEARD_CHOICES);
      break;
    }
    case "beard_color": {
      currentBeardColor = clampInt(raw, 0, 63, 0);
      currentBeard = setOverlayChoice(localPlayer, 1, currentBeard, currentBeardColor, MAX_BEARD_CHOICES);
      break;
    }

    case "brows": {
      currentBrows = setOverlayChoice(localPlayer, 2, raw, currentBrowColor, MAX_BROWS_CHOICES);
      break;
    }
    case "brows_color": {
      currentBrowColor = clampInt(raw, 0, 63, 0);
      currentBrows = setOverlayChoice(localPlayer, 2, currentBrows, currentBrowColor, MAX_BROWS_CHOICES);
      break;
    }

    case "eyeliner": {
      currentEyeliner = setOverlayChoice(localPlayer, 4, raw, currentEyelinerColor, MAX_EYELINER_CHOICES);
      break;
    }
    case "eyeliner_color": {
      currentEyelinerColor = clampInt(raw, 0, 63, 0);
      currentEyeliner = setOverlayChoice(localPlayer, 4, currentEyeliner, currentEyelinerColor, MAX_EYELINER_CHOICES);
      break;
    }

    case "eyeshadow": {
      currentEyeShadow = setOverlayChoice(localPlayer, 5, raw, currentEyeShadowColor, MAX_EYESHADOW_CHOICES);
      break;
    }
    case "eyeshadow_color": {
      currentEyeShadowColor = clampInt(raw, 0, 63, 0);
      currentEyeShadow = setOverlayChoice(localPlayer, 5, currentEyeShadow, currentEyeShadowColor, MAX_EYESHADOW_CHOICES);
      break;
    }

    // ----------------------------
    // EYE COLOR
    // ----------------------------
    case "eyes": {
      const e = clampInt(raw, 0, MAX_EYE_COLOR - 1, 0);
      try { localPlayer.setEyeColor(e); } catch (e2) {}
      break;
    }

    // ----------------------------
    // CLOTHES (list üzerinden)
    // ----------------------------
    case "top": {
      const arr = isMale ? maleTops : femaleTops;
      currentTopChoice = cycleChoiceWithNone(raw, arr.length);
      applyClothesFromState(isMale);
      break;
    }

    case "legs": {
      const arr = isMale ? maleLegs : femaleLegs;
      currentLegChoice = cycleChoiceWithNone(raw, arr.length);
      applyClothesFromState(isMale);
      break;
    }

    case "shoes": {
      const arr = isMale ? maleShoes : femaleShoes;
      currentShoeChoice = cycleChoiceWithNone(raw, arr.length);
      applyClothesFromState(isMale);
      break;
    }

    default: {
      // bilinmeyen tip -> ignore
      break;
    }
  }
});

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

  // ✅ UI / camera / control temizliği (yoksa HUD kapalı & hareket kilitli kalır)
  inSelectorMode = false;

  // Creator cam aktif kalırsa render loop her framede HUD/controls kapatır -> mutlaka destroy et
  destroyCreatorCam();
  if (selectorCam) { try { selectorCam.destroy(); } catch (e) {} selectorCam = null; }

  setCreatorState(false);
  mp.game.cam.renderScriptCams(false, false, 0, true, false);

  // Güvenli reset
  try { mp.game.ui.displayRadar(true); } catch (e) {}
  try { mp.gui.cursor.show(false, false); } catch (e) {}
  try { localPlayer.freezePosition(false); } catch (e) {}
  try { localPlayer.setInvincible(false); } catch (e) {}

  // Chat'i açma (siyah kutu dönmesin diye) — HUD ayrı, chat ayrı.
  mp.gui.chat.show(false);
  mp.gui.chat.activate(false);

  mp.events.callRemote("server:character:spawnFinal", type);

  // UI kapanır kapanmaz HUD/controls geri gelsin (server spawn gecikmesi için 2 kez)
  setTimeout(() => restoreGameplay(true), 400);
  setTimeout(() => restoreGameplay(true), 1500);
});

// --------------------------------------------------
// Gameplay restore (HUD / controls / idlecam)
// --------------------------------------------------
function restoreGameplay(force = false) {
  // UI açıkken yanlışlıkla açma
  const ui = (inSelectorMode || !!(creatorCam || charBrowser || spawnBrowser || selectorBrowser));
  if (ui && !force) return;

  try { mp.gui.cursor.show(false, false); } catch (e) {}
  try { localPlayer.freezePosition(false); } catch (e) {}
  try { localPlayer.setInvincible(false); } catch (e) {}

  // HUD/Radar
  try { mp.game.ui.displayHud(true); } catch (e) {}
  try { mp.game.ui.displayRadar(true); } catch (e) {}

  // Idle cam tekrar serbest (oyunda kalsın)
  // (Bazı buildlerde enable native yok, ama disable çağrısı yapmayacağız)
}

mp.events.add("playerSpawn", () => {
  // spawn olduğunda (creator değilse) HUD'u garanti et
  restoreGameplay(false);

  // bazen 1 frame gecikmeyle radar açılıyor
  setTimeout(() => restoreGameplay(true), 300);
  setTimeout(() => restoreGameplay(true), 1500);
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

mp.events.add("client:selector:play", () => {
  // Test için bildirim (ekranda görürsün)
  try { notify("OYNA tıklandı ✅"); } catch(e) {}

  // Selector UI + kamera kapat
  try { cleanUpSelector(); } catch(e) {}

  // Cursor kapat / oyuncuyu serbest bırak
  try { mp.gui.cursor.show(false, false); } catch(e) {}
  try { mp.players.local.freezePosition(false); } catch(e) {}
  try { mp.players.local.setInvincible(false); } catch(e) {}

  // Spawn menüsünü server'dan iste
  mp.events.callRemote("server:character:requestSpawnMenu");
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

    mp.game.invoke("0xF4F2C0D4EE209E20"); // InvalidateIdleCam
    mp.game.invoke("0x9E4CFFF989258472"); // DisableIdleCam

    hideHudThisFrame();
    return;
  }
});
