// DOSYA: packages/server/sistemler/oyun-suresi.js

const db = require('../db'); // Veritabanı bağlantın

// Dakikada bir herkesin süresini 1 arttır
setInterval(() => {
    mp.players.forEach((player) => {
        if (player.getVariable('girisYapti')) {
            // Haftalık ve Günlük süreyi (dakika cinsinden) arttır
            let currentWeekly = player.getVariable('playTimeWeekly') || 0;
            let currentDaily = player.getVariable('playTimeDaily') || 0;

            player.setVariable('playTimeWeekly', currentWeekly + 1);
            player.setVariable('playTimeDaily', currentDaily + 1);

            // Veritabanına kaydet (Performans için her dakika değil, çıkışta kaydedilebilir ama şimdilik böyle olsun)
            // NOT: Gerçek sunucuda bunu oyuncu çıkarken kaydetmek daha performanslıdır.
        }
    });
}, 60000); // 60 saniye = 1 dakika

// Oyuncu oyuna girdiğinde veritabanından süreleri çek
mp.events.add('playerReady', async (player) => {
    // Burada DB'den çekme kodu olmalı. Şimdilik test için 0 başlatıyoruz veya rastgele veriyoruz.
    // Örnek: const data = await db.query('SELECT playtime_weekly, playtime_daily FROM characters WHERE id = ?', [player.id]);
    
    // TEST İÇİN: Herkese rastgele 60 saat (3600 dk) verelim ki çekilişi dene
    player.setVariable('playTimeWeekly', 3600); 
    player.setVariable('playTimeDaily', 120);
    player.setVariable('girisYapti', true);
});

// Haftalık Sıfırlama Komutu (Sadece Admin)
mp.events.addCommand('suresifirla', (player, type) => {
    if (type === 'haftalik') {
        mp.players.forEach(p => p.setVariable('playTimeWeekly', 0));
        player.outputChatBox("!{FF0000}[ADMİN] Tüm haftalık süreler sıfırlandı!");
    } else if (type === 'gunluk') {
        mp.players.forEach(p => p.setVariable('playTimeDaily', 0));
        player.outputChatBox("!{FF0000}[ADMİN] Tüm günlük süreler sıfırlandı!");
    }
});