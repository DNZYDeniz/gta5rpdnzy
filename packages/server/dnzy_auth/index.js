const { getPool } = require("../db");
const security = require("../security");
const bcrypt = require("bcryptjs");
// 👇 Karakter verilerini çekmek için bu dosya şart (Senin orijinalinde de vardı)
const dbHandler = require('../character/db_handler'); 

// ======================================
// DNZY RP — AUTH (SERVER) - FINAL & ISOLATED
// ======================================

// --- YARDIMCI FONKSİYONLAR ---
function ok(player, payload) {
  player.call("auth:ok", [payload]);
}

function fail(player, code, msg) {
  player.call("auth:fail", [{ code, msg }]);
}

// ✅ AUTH DIMENSION (Kasma önleyici & İzolasyon)
// Her oyuncu 50000 + Kendi ID'si boyutunda olur. Kimse kimseyi görmez.
function enterAuthDimension(player) {
  const dim = 50000 + player.id; 
  player.setVariable("__authDim", dim);
  player.dimension = dim;
}

function leaveAuthDimension(player) {
  player.dimension = 0;
  player.setVariable("__authDim", null);
}

// Oyuncu girince auth dimension'a al
mp.events.add("playerReady", (player) => {
  try {
    enterAuthDimension(player);
  } catch (e) {
    // dimension set hatası olursa auth yine çalışsın diye fail yok
    console.log("[dnzy_auth] enterAuthDimension hata:", e.message);
  }
});

// Spawn final (veya oyuna geçiş) anında çağırmak için
mp.events.add("dnzy:auth:leaveDimension", (player) => {
  try {
    leaveAuthDimension(player);
  } catch (e) {
    console.log("[dnzy_auth] leaveAuthDimension hata:", e.message);
  }
});

// Veritabanı bağlantı testi - Sunucu açıldığında bir kez çalışır
mp.events.add("packagesLoaded", async () => {
  try {
    const pool = getPool();
    const [rows] = await pool.query("SELECT 1 AS ok");
    console.log("[dnzy_auth] Veritabanı Bağlantısı Aktif ✅");
  } catch (e) {
    console.log("[dnzy_auth] Veritabanı Bağlantı HATASI ❌", e.message);
  }
});

// -------------------- KAYIT (REGISTER) --------------------
mp.events.add("auth:register", async (player, payloadJson) => {
  const gate = security.registerGate(player);
  if (!gate.ok) return fail(player, "RATE", "Çok hızlı deneme. Lütfen bekle.");

  let data = null;
  try { data = JSON.parse(payloadJson || "{}"); } catch (_) { data = {}; }

  const email = String(data.email || "").trim();
  const password = String(data.password || "");

  if (!email || !password)
    return fail(player, "INVALID", "Lütfen email ve şifre alanlarını doldurun.");

  try {
    const pool = getPool();

    const [exists] = await pool.query("SELECT id FROM accounts WHERE email=? LIMIT 1", [email]);
    if (exists.length)
      return fail(player, "EXISTS", "Bu email adresi zaten kullanımda.");

    const pass_hash = await bcrypt.hash(password, 12);
    const [res] = await pool.query(
      "INSERT INTO accounts (email, pass_hash) VALUES (?,?)",
      [email, pass_hash]
    );

    const newId = res.insertId;
    player.setVariable("accountId", newId);
    player.loggedIn = true;

    // İSTERSEN: kayıt olur olmaz normal dimension'a dön (Şu an kapalı, izolasyon için)
    // leaveAuthDimension(player);

    ok(player, { step: "registered", accountId: newId });
    console.log(`[AUTH] Yeni hesap oluşturuldu: ${email} (ID: ${newId})`);

    // Kayıt sonrası otomatik creator
    setTimeout(() => {
        mp.events.call("server:character:requestCreator", player);
    }, 500);

  } catch (e) {
    console.log("[auth:register] Hata:", e.message);
    fail(player, "SERVER", "Sunucu tarafında bir hata oluştu.");
  }
});

// -------------------- GİRİŞ (LOGIN) - DIMENSION FIX --------------------
mp.events.add("auth:login", async (player, payloadJson) => {
  const gate = security.loginGate(player);
  if (!gate.ok) return fail(player, "RATE", "Çok fazla deneme yaptınız.");

  let data = null;
  try { data = JSON.parse(payloadJson || "{}"); } catch (_) { data = {}; }

  const email = String(data.email || "").trim();
  const password = String(data.password || "");

  if (!email || !password) return fail(player, "INVALID", "Email veya şifre boş.");

  try {
    const pool = getPool();
    const [rows] = await pool.query("SELECT id, pass_hash, failed_logins, locked_until FROM accounts WHERE email=? LIMIT 1", [email]);

    if (!rows.length) return fail(player, "AUTH", "Hatalı bilgiler.");

    const acc = rows[0];
    const okPass = await bcrypt.compare(password, acc.pass_hash);
    
    if (!okPass) {
        await pool.query("UPDATE accounts SET failed_logins = failed_logins + 1 WHERE id = ?", [acc.id]);
        return fail(player, "AUTH", "Hatalı bilgiler.");
    }

    // Giriş Başarılı
    await pool.query("UPDATE accounts SET failed_logins = 0, last_login_at = NOW() WHERE id = ?", [acc.id]);
    player.setVariable("accountId", acc.id);
    player.loggedIn = true;

    // Karakter Kontrolü
    const charData = await dbHandler.getCharacterForLogin(acc.id);

    if (charData) {
        // --- SENARYO 1: KARAKTER VAR -> SEÇİM EKRANI ---
        
        // ÖZEL BOYUT HESAPLA (50000 + ID)
        const myDimension = 50000 + player.id;
        
        // Oyuncuyu bu boyuta alıyoruz (İzolasyon için)
        // NOT: player.dimension = 0 YAPMIYORUZ!
        player.dimension = myDimension;
        player.setVariable("__authDim", myDimension);

        // Gün hesapla
        let diffDays = 0;
        if(charData.created_at) {
            const diffTime = Math.abs(new Date() - new Date(charData.created_at));
            diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
        }

        const selectorData = {
            charId: charData.id,
            name: charData.rp_name || "Bilinmiyor",
            money: charData.money || 0,
            days: diffDays,
            hours: 0, 
            gender: charData.gender,
            appearance: charData.appearance_json,
            clothes: charData.clothes_json
        };

        // Giriş ekranını kapat
        ok(player, { step: "logged_in", accountId: acc.id });

        // Veriyi ve BOYUT BİLGİSİNİ Client'a gönderiyoruz
        setTimeout(() => {
            console.log(`[AUTH] Selector Başlatılıyor. Dim: ${myDimension}`);
            // DİKKAT: İkinci parametre olarak myDimension gönderdik!
            player.call("client:character:startSelector", [JSON.stringify(selectorData), myDimension]);
        }, 500);

    } else {
        // --- SENARYO 2: KARAKTER YOK -> OLUŞTURUCU ---
        ok(player, { step: "logged_in", accountId: acc.id });
        setTimeout(() => {
            mp.events.call("server:character:requestCreator", player);
        }, 500);
    }

    console.log(`[AUTH] Giriş: ${email}`);

  } catch (e) {
    console.log("[auth:login] Hata:", e.message);
    fail(player, "SERVER", "Sunucu hatası.");
  }
});