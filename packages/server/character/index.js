const security = require("../security.js");
const dbHandler = require("./db_handler.js");
const { getPool } = require("../db");

console.log("[CHAR SERVER] character/index.js YÜKLENDİ ✅");

// ----------------------------------------------------
// Model değiştir
// ----------------------------------------------------
mp.events.add("server:character:changeModel", (player, model) => {
  try {
    player.model = mp.joaat(model);
  } catch (e) {
    console.log("[CHAR] changeModel hata:", e.message);
  }
});

// ----------------------------------------------------
// Creator başlat (Auth’tan geldiğinde zaten dimension’dasın)
// NOT: Eskiden player.dimension = player.id+1 yapıyordun.
// Bu artık GEREKSİZ çünkü auth dimension zaten unique.
// Ayrıca dimension değiştirirsen auth izolasyon mantığı bozulur.
// ----------------------------------------------------
mp.events.add("server:character:requestCreator", (player) => {
  try {
    player.position = new mp.Vector3(-802.3, 175.0, 72.8); // creator odası
    // ❌ player.dimension = player.id + 1;  // KALDIRILDI (auth dim zaten unique)
    player.call("client:character:startCreator");
  } catch (e) {
    console.log("[CHAR] requestCreator hata:", e.message);
  }
});

// ----------------------------------------------------
// Karakter kaydet
// ----------------------------------------------------
mp.events.add("server:character:save", async (player, name, surname, age, gender, appJson) => {
  console.log("--------------------------------------------------");
  console.log(`[CHAR-LOG] ${player.name} için kayıt süreci başladı.`);

  const gate = security.uiGate(player, "save_char");
  if (!gate.ok) {
    console.log("[CHAR-LOG] GÜVENLİK ENGELİ: Security Gate geçilemedi.");
    try { player.call("client:char:unlockUI"); } catch (_) {}
    return;
  }

  try {
    const accountId = player.getVariable("accountId");
    console.log(`[CHAR-LOG] Oyuncu AccountID: ${accountId}`);

    if (!accountId) {
      console.log("[CHAR-LOG] DURDURULDU: AccountID bulunamadı (NULL).");
      player.call("client:char:showError", ["AccountID bulunamadı. Lütfen yeniden giriş yap."]);
      player.call("client:char:unlockUI");
      return;
    }

    // İsim temizleme
    const cleanName = String(name || "").trim().replace(/[^a-zA-Z ]/g, "").replace(/\s+/g, " ");
    const cleanSurname = String(surname || "").trim().replace(/[^a-zA-Z ]/g, "").replace(/\s+/g, " ");
    const fullName = `${cleanName} ${cleanSurname}`.trim();

    if (!cleanName || !cleanSurname) {
      player.call("client:char:showError", ["İsim ve soyisim boş olamaz."]);
      player.call("client:char:unlockUI");
      return;
    }

    // Duplicate name check
    const pool = getPool();
    const [rows] = await pool.query("SELECT id FROM characters WHERE rp_name = ? LIMIT 1", [fullName]);
    if (rows.length > 0) {
      const hataMesaji = "Bu karakter ismi zaten bir başkası tarafından alınmış! Lütfen farklı bir isim seçin.";
      console.log(`[CHAR-LOG] REDDEDİLDİ: ${fullName} ismi kullanımda.`);
      player.call("client:char:showError", [hataMesaji]);
      player.call("client:char:unlockUI");
      return;
    }

    // Gender normalize
    const gStr = String(gender || "").toUpperCase();
    const genderStr = (gStr === "KADIN" || gStr === "FEMALE" || gStr === "1") ? "female" : "male";

    console.log(`[CHAR-LOG] Veritabanına Yazılıyor: ${fullName} | Cinsiyet: ${genderStr}`);

    // Appearance parse
    let appearanceData = {};
    try {
      appearanceData = (typeof appJson === "string") ? JSON.parse(appJson) : (appJson || {});
    } catch (err) {
      console.log("[CHAR-LOG] JSON Hatası: Görünüm verisi ayrıştırılamadı.");
      appearanceData = {};
    }

    const ageNum = parseInt(age, 10) || 25;
    const clothes = { age: ageNum };

    // DB insert
    const charId = await dbHandler.saveNewCharacter(
      accountId,
      cleanName,
      cleanSurname,
      genderStr,
      appearanceData,
      clothes
    );

    if (!charId) {
      player.call("client:char:showError", ["Karakter oluşturulamadı. (charId boş döndü)"]);
      player.call("client:char:unlockUI");
      return;
    }

    // ✅ charId set (spawnFinal + isim sistemi için)
    player.charId = charId;
    player.setVariable("charId", charId);

    // ✅ rp isim/id set (spawnFinal’de tekrar DB çekmesen de olur)
    player.setVariable("rp_isim_soyisim", fullName);
    player.setVariable("rp_ozel_id", charId);

    // Ek: senin kimlik sistemin
    const tamIsimFormatli = `${cleanName}_${cleanSurname}`;
    try {
      mp.events.call("ozel:kimlikAta", player, tamIsimFormatli, charId);
    } catch (e) {
      console.log("[CHAR] ozel:kimlikAta hata:", e.message);
    }

    console.log(`[CHAR-LOG] BAŞARILI! Karakter Oluşturuldu (ID: ${charId})`);
    player.outputChatBox("!{00FF00}[DNZY] Karakter başarıyla oluşturuldu!");

    // ✅ UI unlock + spawn menu aç
    player.call("client:char:unlockUI");
    player.call("client:character:showSpawnMenu", [false, false]); // şimdilik false/false

  } catch (e) {
    console.log("!!! [SQL / SİSTEM HATASI] !!!");
    console.log("Hata Mesajı:", e.message);
    try {
      player.call("client:char:showError", ["Sunucu hatası: " + e.message]);
      player.call("client:char:unlockUI");
    } catch (_) {}
  }

  console.log("--------------------------------------------------");
});

// ----------------------------------------------------
// Spawn final: spawn seçiminden sonra çağrılır
// NOT: Server-side freezePosition YOK! (senin hatan buradaydı)
// Donma/çözme client’ta zaten yapılıyor.
// ----------------------------------------------------
mp.events.add("server:character:spawnFinal", async (player, spawnType) => {
  console.log(`[CHAR-LOG] Spawn işlemi: ${player.name} | Seçilen Tip: ${spawnType}`);

  // (Opsiyonel) DB’den rp_name çek — garanti olsun
  try {
    const cid = player.charId || player.getVariable("charId");
    if (cid) {
      const pool = getPool();
      const [rows] = await pool.query("SELECT rp_name FROM characters WHERE id = ?", [cid]);
      if (rows.length > 0) {
        const dbName = rows[0].rp_name;
        player.setVariable("rp_isim_soyisim", dbName);
        player.setVariable("rp_ozel_id", cid);
        console.log(`[SPAWN] İsim Yüklendi: ${dbName}`);
      }
    }
  } catch (e) {
    console.log("[SPAWN HATASI] İsim çekilemedi:", e.message);
  }
// ✅ İŞTE BURASI!
  // Oyuncuyu sanal dünyadan (50000+ID) alıp GERÇEK DÜNYAYA (0) koyuyoruz.
  try {
    mp.events.call("dnzy:auth:leaveDimension", player); 
  } catch (e) {
    player.dimension = 0; // Fallback
    player.setVariable("__authDim", null);
  }

  // Görünürlük aç
  player.alpha = 255;

  const spawnPoints = [
    new mp.Vector3(-1037.7, -2738.0, 13.7), // OTEL
    new mp.Vector3(-100.0, -100.0, 20.0),   // EV
    new mp.Vector3(200.0, 200.0, 20.0),     // AİLE
    new mp.Vector3(312.3, -209.1, 54.0)     // HAVALİMANI
  ];

  const idx = Math.max(0, Math.min(3, parseInt(spawnType, 10) || 0));
  player.spawn(spawnPoints[idx]);
  player.heading = 180;
});