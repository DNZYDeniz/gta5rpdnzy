// 2. MODÜLLER
require('./dnzy_auth/index.js'); 
require('./character/index.js'); 
require('./nametags.js');
require('./advanced-chat/index.js');
require('./adminpanel/index.js');

// ==========================================================
// LOGIN VE AUTH SİSTEMİ
// ==========================================================

let browser = null;
let opened = false;
let loggedIn = false;

// --- ARAYÜZ VE KAMERA YÖNETİMİ ---

function openWelcome() {
    if (opened) return;
    opened = true;
    mp.events.call('advancedChat:disable'); 

    // UI Ayarları
    mp.gui.chat.show(false);
    mp.gui.chat.activate(false);
    mp.game.ui.displayRadar(false);
    mp.gui.cursor.show(true, true);

    // Karakteri Gizle / Dondur
    mp.players.local.freezePosition(true);
    mp.players.local.setAlpha(0);

    // Canlı Kamera
    if (globalThis.DNZY_AUTH && globalThis.DNZY_AUTH.startAuthCamera) {
        globalThis.DNZY_AUTH.startAuthCamera();
    }

    // Browser
    browser = mp.browsers.new("package://dnzy_auth/ui/index.html");
}

function closeAll() {
    if (browser) {
        browser.destroy();
        browser = null;
    }

    if (globalThis.DNZY_AUTH && globalThis.DNZY_AUTH.stopAuthCamera) {
        globalThis.DNZY_AUTH.stopAuthCamera();
    }

    mp.gui.chat.show(false);
    mp.gui.chat.activate(false);
    mp.gui.cursor.show(false, false);
    
    // *** TEMİZLİK ***
    mp.game.streaming.clearFocus(); 

    opened = false;
    loggedIn = true; 
}

// --- TEK BİR PLAYER READY EVENTİ ---

mp.events.add("playerReady", () => {
    // Auth ekranını aç
    openWelcome();
    
    // Chat'i gizle (Auth bitene kadar)
    mp.gui.chat.show(false);      
    mp.gui.chat.activate(false); 

});

// --- DİĞER EVENTLER ---

mp.events.add("dnzy:welcome:enter", () => {
    if (!browser) return;
    mp.gui.cursor.show(true, true);
    browser.execute(`window.__dnzyGoAuth && window.__dnzyGoAuth();`);
});

mp.events.add("dnzy:auth:login", (payloadJson) => mp.events.callRemote("auth:login", payloadJson));
mp.events.add("dnzy:auth:register", (payloadJson) => mp.events.callRemote("auth:register", payloadJson));

mp.events.add("auth:ok", (payload) => {
    if (!browser) return;
    browser.execute(`window.__dnzyAuthOk && window.__dnzyAuthOk();`);
    setTimeout(() => {
        closeAll(); 
        mp.events.call('advancedChat:enable');
    }, 1500);
});

mp.events.add("auth:fail", (payload) => {
    if (!browser) return;
    const msg = (payload && payload.msg) ? String(payload.msg) : "Hata";
    browser.execute(`window.__dnzyAuthFail && window.__dnzyAuthFail(${JSON.stringify(msg)});`);
});

// Mouse Kontrolü
let isCursorVisible = false;
mp.keys.bind(0x71, false, () => { if(loggedIn) { isCursorVisible = !isCursorVisible; mp.gui.cursor.show(isCursorVisible, isCursorVisible); } });
mp.keys.bind(0xDE, false, () => { if(loggedIn) { isCursorVisible = !isCursorVisible; mp.gui.cursor.show(isCursorVisible, isCursorVisible); } });