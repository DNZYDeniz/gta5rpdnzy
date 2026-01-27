// DOSYA: packages/sunucum/kimlik-yoneticisi.js

// Bu sistem "ozel:kimlikAta" diye bir komut bekler.
mp.events.add('ozel:kimlikAta', (player, gelenIsim, gelenID) => {
    
    // Gelen veriyi oyuncunun üzerine yapıştırıyoruz
    player.setVariable('rp_isim_soyisim', gelenIsim);
    
    // Eğer özel bir ID sistemi yaptıysan onu, yoksa oyunun ID'sini kullan
    player.setVariable('rp_ozel_id', gelenID);

    console.log(`[KIMLIK SISTEMI] ${player.name} oyuncusuna ${gelenIsim} ismi atandı.`);
});