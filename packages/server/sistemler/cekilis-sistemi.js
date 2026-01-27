// DOSYA: packages/server/sistemler/cekilis-sistemi.js

// DİKKAT: Artık 'addCommand' değil, özel bir event kullanıyoruz.
mp.events.add('ozel:cekilisBaslat', (player, params) => {
    
    // --- 1. ADMİN KONTROLÜ ---
    // Eğer admin seviyesi yoksa veya 0 ise komut çalışmaz.
    if (!player.getVariable('adminLevel') || player.getVariable('adminLevel') <= 0) {
        player.call('client:mesajGoster', ["!{FF0000}[HATA] Bu komutu kullanmak için yetkiniz yok!"]);
        return;
    }

    // Argümanları parçala
    // params sadece sayıları ve seçenekleri içerir (örn: "1 1 1 global gc 100")
    let args = params.split(' ');

    if (args.length < 6) {
        player.call('client:mesajGoster', ["!{FFFF00}KULLANIM: /getrandomwinner [Saat] [1=Hafta/0=Gün] [Kişi] [global/private] [gc/para] [Miktar]"]);
        return;
    }

    let minSaat = parseInt(args[0]);
    let periyot = parseInt(args[1]); 
    let kazananSayisi = parseInt(args[2]);
    let gorunurluk = args[3].toLowerCase();
    let odulTipi = args[4].toLowerCase();
    let odulMiktar = args[5]; 

    // Güvenlik Limitleri
    if (kazananSayisi > 25) kazananSayisi = 25;

    // 2. Katılımcıları Bul
    let adaylar = [];
    
    mp.players.forEach((p) => {
        let oynadigiDakika = periyot === 1 ? p.getVariable('playTimeWeekly') : p.getVariable('playTimeDaily');
        let oynadigiSaat = (oynadigiDakika || 0) / 60; 

        if (oynadigiSaat >= minSaat) {
            adaylar.push(p);
        }
    });

    if (adaylar.length === 0) {
        player.call('client:mesajGoster', ["!{FF0000}[HATA] Bu kriterlere uygun oyuncu bulunamadı!"]);
        return;
    }

    if (adaylar.length < kazananSayisi) {
        kazananSayisi = adaylar.length;
    }

    // 3. Karıştır ve Seç
    for (let i = adaylar.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [adaylar[i], adaylar[j]] = [adaylar[j], adaylar[i]];
    }
    
    let kazananlar = adaylar.slice(0, kazananSayisi);

    // 4. İkonu Belirle
    let ikonHTML = "";
    if (odulTipi === 'gc') ikonHTML = `<span class='icon-gc'>GC</span>`;
    else if (odulTipi === 'para' || odulTipi === 'money') ikonHTML = `<span class='icon-money'>$</span>`;

    let kazananIsimler = [];

    // Kazananlara Bildirim
    kazananlar.forEach((winner) => {
        kazananIsimler.push(winner.name);
        winner.call('client:mesajGoster', [`!{00FF00}TEBRİKLER! Çekilişi kazandın: ${odulMiktar} ${odulTipi.toUpperCase()}`]);
    });

    // 5. Duyuru Mesajı
    let duyuruMesaji = `
        <div style="background: linear-gradient(90deg, rgba(0,0,0,0.9) 0%, rgba(20,20,20,0.8) 100%); border-left: 5px solid #ffd700; padding: 12px; margin-bottom: 5px; border-radius: 4px;">
            <div style="color: #ffd700; font-size: 18px; font-weight: 900; border-bottom: 1px solid rgba(255,255,255,0.1); margin-bottom: 8px; padding-bottom: 5px;">
                🎉 ÇEKİLİŞ SONUÇLANDI!
            </div>
            <div style="color: white; font-size: 15px; font-weight: bold;">
                <span style="color: #aaa; font-weight: normal;">Ödül:</span> ${ikonHTML} ${odulMiktar}<br>
                <span style="color: #aaa; font-weight: normal;">Şart:</span> ${minSaat} Saat (${periyot === 1 ? 'Haftalık' : 'Günlük'})<br>
                <span style="color: #00ff00; font-weight: normal;">Kazananlar:</span> ${kazananIsimler.join(', ')}
            </div>
        </div>
    `;

    // 6. GÖNDERİM TİPİ
    if (gorunurluk === 'global') {
        mp.players.call('client:mesajGoster', [duyuruMesaji]);
    } else {
        player.call('client:mesajGoster', [duyuruMesaji]);
        player.call('client:mesajGoster', ["!{FFFF00}[BİLGİ] Bu mesajı sadece siz görüyorsunuz (Private Mod)."]);
    }
});