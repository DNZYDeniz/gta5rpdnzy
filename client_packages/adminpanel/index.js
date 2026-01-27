// client_packages/adminpanel/index.js

let adminBrowser = null;
let isPanelOpen = false;
let isAdmin = false; 

// Sunucudan oyuncunun admin olup olmadığı bilgisini al
mp.events.add('client:setAdminStatus', (level) => {
    if (level > 0) {
        isAdmin = true;
        // Oyuncuya bilgi verelim
        mp.gui.chat.push("!{#FFD700}[YÖNETİM] !{#FFF} Yönetici olarak giriş yapıldı. Panel tuşu: 8");
    }
});

// Oyuncu hazır olduğunda (Giriş yaptığında) Browser'ı oluştur ama gösterme
mp.events.add('playerReady', () => {
    if (!adminBrowser) {
        // Yeni klasör yapına göre yol burası:
        adminBrowser = mp.browsers.new('package://adminpanel/ui/admin_panel.html');
    }
});

// Tuş Ataması (8 Tuşu = KeyCode 0x38)
mp.keys.bind(0x38, true, function() {
    // Admin değilse panel açılmasın
    if (!isAdmin) return; 

    isPanelOpen = !isPanelOpen; // Durumu tersine çevir (Açık -> Kapalı)

    if (isPanelOpen) {
        // Paneli Göster ve Mouse'u aktif et
        adminBrowser.execute('togglePanel(true)');
        mp.gui.cursor.show(true, true); 
    } else {
        // Paneli Gizle ve Mouse'u kapat
        adminBrowser.execute('togglePanel(false)');
        mp.gui.cursor.show(false, false);
    }
});

// HTML'den (Browser) gelen emirleri alıp Sunucuya ilet
mp.events.add('client:adminAction', (action, value) => {
    // Güvenlik için işlemi burada yapmıyoruz, sunucuya "bunu yap" diyoruz
    mp.events.callRemote('server:adminProcess', action, value);
});