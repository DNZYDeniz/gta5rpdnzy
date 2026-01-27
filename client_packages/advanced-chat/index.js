// DOSYA: client_packages/advanced-chat/index.js
// ✅ Auth sırasında chat kapalı
// ✅ Login sonrası manuel açılabilir
// ✅ Default RageMP chat her zaman kapalı tutulur

let chatBrowser = null;
let isChatOpen = false;

// 🔒 Başlangıçta kapalı: auth ekranında 2 chat görünmesin
let chatEnabled = false;

// ---- Default RageMP chat'i sürekli kapalı tut
function killDefaultChat() {
  mp.gui.chat.show(false);
  mp.gui.chat.activate(false);
}

// ---- Advanced chat CEF'i (lazım olunca yarat)
function ensureChatBrowser() {
  if (chatBrowser) return;

  chatBrowser = mp.browsers.new('package://advanced-chat/index.html');
  chatBrowser.markAsChat();

  // ilk açılışta kapalı başlasın
  try { chatBrowser.execute(`window.api && window.api.toggle(false)`); } catch (e) {}
}

// ---- Dışarıdan kontrol edilecek eventler
mp.events.add('advancedChat:enable', () => {
  chatEnabled = true;
  ensureChatBrowser();
  // cursor kapalı kalsın, chat paneli kapalı başlasın
  setChatState(false);
});

mp.events.add('advancedChat:disable', () => {
  chatEnabled = false;
  setChatState(false);

  // Browser’ı tamamen kapatmak istersen aç:
  // if (chatBrowser) { chatBrowser.destroy(); chatBrowser = null; }
});

// (İstersen kullan) direkt show/hide
mp.events.add('advancedChat:show', () => {
  chatEnabled = true;
  ensureChatBrowser();
});

mp.events.add('advancedChat:hide', () => {
  setChatState(false);
  chatEnabled = false;
});

// ---- Player ready
mp.events.add('playerReady', () => {
  // auth ekranında advanced-chat istemiyoruz:
  // burada browser yaratmıyoruz ✅
  killDefaultChat();
});

// ---- Render: default chat açılmaya çalışırsa anında kapat
mp.events.add('render', () => {
  if (mp.gui.chat && mp.gui.chat.visible) {
    killDefaultChat();
  }
});

// ---- T tuşu: sadece chatEnabled ise açılır
mp.keys.bind(0x54, true, () => {
  if (!chatEnabled) return;
  if (!isChatOpen && mp.gui.cursor.visible === false) {
    setChatState(true);
  }
});

mp.events.add('chat:close', () => setChatState(false));

// ---- Mesaj gönderme
mp.events.add('chat:submit', (text, channel) => {
  if (!chatEnabled) return;
  if (!text || text.trim().length === 0) return;

  if (text[0] === '/') {
    mp.events.callRemote('server:komutCalistir', text.substring(1));
  } else {
    mp.events.callRemote('ozel:chatMesaji', text, channel);
  }
});

// ---- Sunucudan mesaj gösterme
mp.events.add('client:mesajGoster', (msgContent) => {
  if (!chatEnabled) return;
  ensureChatBrowser();
  if (chatBrowser) chatBrowser.execute(`window.api.push(${JSON.stringify(msgContent)})`);
});

function setChatState(state) {
  isChatOpen = state;

  // cursor sadece chat açılınca gelsin
  mp.gui.cursor.show(state, state);

  if (chatBrowser) {
    try { chatBrowser.execute(`window.api.toggle(${state})`); } catch (e) {}
  }
}
