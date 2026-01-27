// DOSYA: client_packages/nametags.js

const localPlayer = mp.players.local;
const maxDistance = 15.0; // İsimlerin görüneceği maksimum mesafe
const width = 0.03;       // Yazı genişliği
const height = 0.0065;    // Yazı yüksekliği
const border = 0.001;     // Kenarlık kalınlığı

mp.events.add('render', () => {
    // Sadece yayın akışındaki (streamed) oyuncuları döngüye al
    mp.players.forEachInStreamRange((player) => {
        
        // 1. Kendimizde veya görünmez oyuncularda çizme
        if (player !== localPlayer && player.handle !== 0 && player.getAlpha() > 0) {
            
            // 2. Mesafe kontrolü
            const dist = mp.game.system.vdist(
                localPlayer.position.x, localPlayer.position.y, localPlayer.position.z,
                player.position.x, player.position.y, player.position.z
            );

            if (dist < maxDistance) {
                // 3. Server tarafında atadığımız değişkeni çekiyoruz
                // NOT: Server'da setVariable('rp_isim_soyisim', ...) yapmış olman lazım!
                let gorunenIsim = player.getVariable('rp_isim_soyisim');
                
                // Eğer isim henüz yüklenmediyse ID'sini göster veya 'Bilinmiyor' de
                if (!gorunenIsim) gorunenIsim = "Yükleniyor...";

                // ID olarak oyun içi ID'sini (remoteId) kullanıyoruz
                let oyuncuID = player.remoteId; 

                // 4. Yazının formatı: Ad_Soyad (ID)
                let text = `${gorunenIsim} (${oyuncuID})`;

                // 5. Pozisyon Ayarı (Kafanın biraz üstü)
                let pos = player.getBoneCoords(12844, 0, 0, 0); // Kafa kemiği
                pos.z += 0.5; // Biraz yukarı kaldır

                // Mesafeye göre boyut ayarlama (Uzaktaysa küçülsün)
                let scale = (maxDistance - dist) / maxDistance;
                let scaleFactor = 0.4 * scale; 
                if (scaleFactor < 0.2) scaleFactor = 0.2; // Çok küçülmesin

                // 6. Ekrana Çizdir
                mp.game.graphics.drawText(text, 
                    [pos.x, pos.y, pos.z], 
                    { 
                        font: 4, 
                        color: [255, 255, 255, 255], 
                        scale: [scaleFactor, scaleFactor], 
                        outline: true,
                        centre: true
                    }
                );
            }
        }
    });
});