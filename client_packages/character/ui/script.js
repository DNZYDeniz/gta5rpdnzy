function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');
    
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    if (event && event.currentTarget) {
        event.currentTarget.classList.add('active');
    }
}

function updateFeature(index, value) {
    if (window.mp) mp.trigger("client:char:setFeature", index, value);
}

function updateParents() {
    const inputs = document.querySelectorAll('#genetics input');
    if (inputs.length < 4) return;
    const mom = inputs[0].value;
    const dad = inputs[1].value;
    const res = inputs[2].value;
    const skin = inputs[3].value; 
    
    if (window.mp) mp.trigger("client:char:setParents", mom, dad, res, skin);
}

function updateAge(value) {
    const ageEl = document.getElementById('val-age');
    if (ageEl) ageEl.innerText = value;
}

function updateAppearance() {
    const inputs = document.querySelectorAll('#appearance input');
    if (inputs.length < 3) return;
    const hairStyle = inputs[1].value; 
    const hairColor = inputs[2].value;
    
    if (window.mp) mp.trigger("client:char:setAppearance", hairStyle, hairColor);
}

function updateEyes(value) {
    if (window.mp) mp.trigger("client:char:setEyes", value);
}

function updateClothes(type, value) {
    if (window.mp) {
        mp.trigger("client:char:setClothes", type, value);
    }
}

// --- FİNAL KAYIT FONKSİYONU ---
function finish() {
    // Arayüzdeki buton elementini alalım
    const btn = event ? event.target : null;

    try {
        const nameInput = document.getElementById('char-name');
        const surnameInput = document.getElementById('char-surname');
        const ageEl = document.getElementById('val-age');

        const name = nameInput ? nameInput.value.trim() : "";
        const surname = surnameInput ? surnameInput.value.trim() : "";
        const age = ageEl ? ageEl.innerText : "25";
        
        // KRİTİK: alert yerine yeni showAlert fonksiyonumuzu kullanıyoruz
        if (name.length < 2 || surname.length < 2) {
            if (typeof showAlert !== 'undefined') {
                showAlert("DİKKAT: Lütfen geçerli bir isim ve soyisim (en az 2 karakter) giriniz!");
            } else {
                console.error("showAlert fonksiyonu bulunamadı! index.html'i kontrol edin.");
            }
            return; 
        }

        // Butonu kilitliyoruz (çift tıklamayı önlemek için)
        if (btn && btn.id === "finish-btn") btn.disabled = true;

        if (window.mp) {
            // Veriyi sunucuya gönderiyoruz
            mp.trigger("client:char:finish", name, surname, age, "ERKEK", "{}"); 
        }
    } catch (err) {
        // Hata durumunda butonu geri açıyoruz
        if (btn && btn.id === "finish-btn") btn.disabled = false;
        if (typeof showAlert !== 'undefined') showAlert("Hata: " + err.message);
    }
}