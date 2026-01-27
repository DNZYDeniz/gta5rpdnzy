// DOSYA: packages/server/sistemler/chat-yoneticisi.js

mp.events.add('ozel:chatMesaji', (player, message, channel) => {
    
    let gorunenIsim = player.getVariable('rp_isim_soyisim') || player.name;
    let oyuncuID = player.getVariable('rp_ozel_id') || player.id;

    // --- GENEL CHAT ---
    if (channel === 'all' || !channel) {
        let msg = `!{FFFFFF}${gorunenIsim} [${oyuncuID}]: ${message}`;
        console.log(`[GENEL] ${gorunenIsim}: ${message}`);
        mp.players.call('client:mesajGoster', [msg]);
    }

    // --- AİLE CHATİ (GÜVENLİKLİ) ---
    else if (channel === 'family') {
        // Oyuncunun aile ID'sini kontrol et
        let aileID = player.getVariable('aileId'); 

        // EĞER AİLESİ YOKSA VEYA 0 İSE:
        if (!aileID || aileID <= 0) {
            // Sadece hata mesajı göster, kimseye mesaj gitmesin.
            player.call('client:mesajGoster', ["!{FF0000}[HATA] Herhangi bir aileye üye olmadığınız için bu kanalı kullanamazsınız!"]);
            return; // Fonksiyonu burada durdur
        }

        // AİLESİ VARSA DEVAM ET:
        let msg = `!{00FF00}[AİLE] ${gorunenIsim}: ${message}`;
        
        // Sadece aynı ailedeki üyelere gönder
        mp.players.forEach(p => {
            if (p.getVariable('aileId') === aileID) {
                p.call('client:mesajGoster', [msg]);
            }
        });
    }

    // --- /ME KOMUTU ---
    else if (channel === 'me') {
        let msg = `!{C2A2DA}* ${gorunenIsim} ${message}`;
        mp.players.call('client:mesajGoster', [msg]); 
    }

    // --- /DO KOMUTU ---
    else if (channel === 'do') {
        let msg = `!{60A3BC}* ${message} ((${gorunenIsim}))`;
        mp.players.call('client:mesajGoster', [msg]);
    }
});

// TEST İÇİN YARDIMCI KOMUTLAR (Normalde bunları veritabanından çekersin)
mp.events.add('server:komutCalistir', (player, fullText) => {
    let args = fullText.split(' ');
    let cmd = args[0].toLowerCase(); // Komutun ilk kelimesi (örn: getrandomwinner)

    // --- YENİ: ÇEKİLİŞ KOMUTUNU YAKALA ---
    if (cmd === 'getrandomwinner') {
        // Komutun kendisini (getrandomwinner kelimesini) atıp sadece parametreleri alıyoruz
        // "getrandomwinner 1 1 1..." -> "1 1 1..." olur
        let params = fullText.substring(cmd.length + 1);
        
        // Çekiliş sistemindeki fonksiyonu çalıştır
        mp.events.call('ozel:cekilisBaslat', player, params);
        return;
    }
    // -------------------------------------

    // Admin Yapma (Test Komutu)
    if (cmd === 'adminyap') {
        let level = parseInt(args[1]) || 0;
        player.setVariable('adminLevel', level);
        player.call('client:mesajGoster', [`!{00FF00}Admin seviyeniz ${level} yapıldı.`]);
    }

    // Aileye Girme (Test Komutu)
    if (cmd === 'aileyap') {
        let aile = parseInt(args[1]) || 0;
        player.setVariable('aileId', aile);
        player.call('client:mesajGoster', [`!{00FF00}Aile ID'niz ${aile} yapıldı.`]);
    }
});