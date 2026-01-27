// packages/server/index.js
require('./db.js');           // Veritabanı bağlantısı [cite: 7]
require('./security.js');     // Anti-spam sistemi [cite: 14]
// packages/server/index.js dosyasının en altı:
require('./sistemler/chat-yoneticisi.js');
require('./sistemler/kimlik-yoneticisi.js'); // Kimlik sistemini dahil et
require('./sistemler/oyun-suresi.js');
require('./sistemler/cekilis-sistemi.js');
// Alt klasörlerdeki sistemleri bağla
require('./dnzy_auth/index.js'); // Giriş kodlarını buradan okur 
require('./character/index.js'); // Karakter kodlarını buradan okur 
require('./adminpanel');
console.log("-> Sunucu Modülleri Bağlandı. ✅");