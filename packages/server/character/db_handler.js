const { getPool } = require("../db");

module.exports = {
  saveNewCharacter: async (accountId, firstName, lastName, gender, appearance, clothes) => {
    const pool = getPool();

    const rpName = `${String(firstName || "").trim()} ${String(lastName || "").trim()}`.trim();
    const age = parseInt((clothes && clothes.age) ?? 25, 10) || 25;

    // Gender ENUM düzeltmesi
    const gStr = String(gender ?? "").toUpperCase();
    const genderEnum = (gStr === "KADIN" || gStr === "F" || gStr === "FEMALE" || gStr === "1")
      ? "female"
      : "male";

    // NOT: money ve created_at'i burada INSERT etmiyoruz çünkü SQL'de 
    // "DEFAULT 1000" ve "DEFAULT CURRENT_TIMESTAMP" ayarı yaptık. 
    // Karakter oluştuğu an otomatik eklenecek.
    const query = `
      INSERT INTO characters
        (account_id, rp_name, age, gender, appearance_json, clothes_json)
      VALUES
        (?, ?, ?, ?, ?, ?)
    `;

    try {
      const [result] = await pool.query(query, [
        accountId,
        rpName,
        age,
        genderEnum,
        JSON.stringify(appearance || {}),
        JSON.stringify(clothes || {})
      ]);

      return result.insertId;
    } catch (err) {
      console.error("[DB ERROR] Karakter kaydedilirken hata oluştu:", err.message);
      throw err;
    }
  },

  // --- GİRİŞ İÇİN KARAKTERİ ÇEK (money ve created_at DAHİL) ---
  getCharacterForLogin: async (accountId) => {
    const pool = getPool();
    
    // ARTIK HATA VERMEZ ÇÜNKÜ SQL'E EKLEDİK
    const query = `
      SELECT id, rp_name, gender, appearance_json, clothes_json, money, created_at 
      FROM characters 
      WHERE account_id = ? 
      LIMIT 1
    `;
    
    const [rows] = await pool.query(query, [accountId]);
    
    // Karakter varsa direkt döndür, yoksa null
    return rows.length > 0 ? rows[0] : null;
  },

  getAccountCharacters: async (accountId) => {
    const pool = getPool();
    const [rows] = await pool.query("SELECT * FROM characters WHERE account_id = ?", [accountId]);
    return rows;
  }
};