// packages/adminpanel/index.js

const REQUIRED_ADMIN_LEVEL = 99; 

// Ev İç Mekan Koordinatları (Işınlanılacak yerler)
const INTERIORS = {
    1: { name: "Standart", x: 266.14, y: -1007.61, z: -101.00 }, // Apt
    2: { name: "Lüks", x: -145.94, y: -593.22, z: 211.77 },      // Penthouse
    3: { name: "Motel", x: 151.45, y: -1007.57, z: -98.99 },     // Motel
    4: { name: "Villa", x: 117.22, y: 559.61, z: 184.30 },       // Villa
    5: { name: "Ofis", x: -141.19, y: -620.91, z: 168.82 }       // Office
};

// 1. OYUNCU GİRİŞİ
mp.events.add('playerJoin', async (player) => {
    player.adminLevel = 0;
    try {
        if (global.db) {
            const [rows] = await global.db.query('SELECT admin_level FROM accounts WHERE username = ?', [player.name]);
            if (rows && rows.length > 0) player.adminLevel = rows[0].admin_level;
        }
    } catch (e) { console.log(e); }

    // Manuel Yetki (Adını buraya yazarsan her zaman admin olursun)
    if (player.name === "OYUNCU_ADIN") player.adminLevel = 99;

    player.call('client:setAdminStatus', [player.adminLevel]);
});

// 2. PANEL İŞLEMLERİ
mp.events.add('server:adminProcess', (player, action, value) => {
    
    // Yetki Kontrolü
    if (!player.adminLevel || player.adminLevel < REQUIRED_ADMIN_LEVEL) return;

    switch (action) {
        // --- TEMEL KOMUTLAR ---
        case 'spawnCar':
            if(!value) return;
            let pos = player.position;
            pos.x += 2;
            let veh = mp.vehicles.new(mp.joaat(value), pos, {
                heading: player.heading,
                numberPlate: "ADMIN",
                dimension: player.dimension
            });
            veh.setColor(0, 0); 
            player.putIntoVehicle(veh, 0);
            player.outputChatBox(`!{#FFD700}[ADMIN] !{#FFF} ${value} oluşturuldu.`);
            break;

        case 'giveMoney':
            let amount = parseInt(value);
            if(!isNaN(amount)) {
                player.money += amount;
                player.outputChatBox(`!{#FFD700}[ADMIN] !{#FFF} $${amount} eklendi.`);
            }
            break;

        case 'healSelf':
            player.health = 100;
            player.armour = 100;
            break;

        // --- İNŞAAT SİSTEMİ (EV / GARAJ / HELİ) ---
        
        case 'createHouse':
            let hData = JSON.parse(value); // Gelen veriyi çöz
            let price = parseInt(hData.price) || 50000;
            let intId = parseInt(hData.interior) || 1;
            let hPos = player.position;

            if (global.db) {
                global.db.query('INSERT INTO houses (price, pos_x, pos_y, pos_z, interior_id) VALUES (?, ?, ?, ?, ?)', 
                [price, hPos.x, hPos.y, hPos.z, intId], (err, res) => {
                    if(!err) {
                        player.outputChatBox(`!{#00FF00}[EV] Başarıyla kuruldu! ID: ${res.insertId} | Model: ${INTERIORS[intId].name}`);
                        
                        // Oyunda anlık marker oluştur (Görmek için)
                        mp.markers.new(1, new mp.Vector3(hPos.x, hPos.y, hPos.z - 1), 1, { color: [0, 255, 0, 100] });
                        mp.blips.new(40, hPos, { name: "Satılık Ev", color: 2, scale: 0.8, shortRange: true });
                    } else {
                        player.outputChatBox("!{red}[HATA] Ev kaydedilemedi.");
                        console.log(err);
                    }
                });
            }
            break;

        case 'createGarage':
            let gData = JSON.parse(value);
            let gPos = player.position;
            
            if (global.db) {
                global.db.query('INSERT INTO garages (type, pos_x, pos_y, pos_z) VALUES (?, ?, ?, ?)', 
                [gData.type, gPos.x, gPos.y, gPos.z], (err, res) => {
                    if(!err) {
                        player.outputChatBox(`!{#3498db}[GARAJ] ${gData.type} garajı kuruldu!`);
                        
                        mp.markers.new(36, gPos, 1, { color: [0, 0, 255, 100] }); // Araba ikonu marker
                        mp.blips.new(357, gPos, { name: "Garaj", color: 3, scale: 0.8, shortRange: true });
                    }
                });
            }
            break;

        case 'createHelipad':
            let helPos = player.position; // Menü yeri
            // Helikopterin ineceği yer (Oyuncunun 4 metre önü)
            let spawnX = helPos.x + Math.sin(-player.heading * Math.PI / 180) * 4;
            let spawnY = helPos.y + Math.cos(-player.heading * Math.PI / 180) * 4;

            if (global.db) {
                global.db.query('INSERT INTO helipads (pos_x, pos_y, pos_z, spawn_x, spawn_y, spawn_z, heading) VALUES (?, ?, ?, ?, ?, ?, ?)', 
                [helPos.x, helPos.y, helPos.z, spawnX, spawnY, helPos.z, player.heading], (err, res) => {
                    if(!err) {
                        player.outputChatBox(`!{#e74c3c}[HELİPAD] Kuruldu! Baktığın yöne heli inecek.`);
                        
                        mp.markers.new(34, helPos, 1, { color: [231, 76, 60, 150] }); // H ikonu marker
                        mp.blips.new(43, helPos, { name: "Helipad", color: 1, scale: 0.8, shortRange: true });
                    }
                });
            }
            break;
    }
});