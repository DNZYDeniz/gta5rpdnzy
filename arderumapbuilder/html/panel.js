let isBrowserTest = false;
if (typeof mp === 'undefined') {
    isBrowserTest = true;
    window.mp = {
        events: {
            _handlers: {},
            add(name, cb) {
                this._handlers[name] = this._handlers[name] || [];
                this._handlers[name].push(cb);
            },
            call(name, ...args) {
                console.log(`[RAGE] Called: ${name}`, args);
                const list = this._handlers[name] || [];
                list.forEach((cb) => {
                    try { cb(...args); } catch (e) { console.error(e); }
                });
            }
        },
        invoke(name, ...args) {
            console.log(`[RAGE] Invoke: ${name}`, args);
        }
    };
    window.objects = ['prop_boxpile_07d', 'v_ilev_fh_door01', 'prop_street_light', 'prop_bench_01a', 'bkr_prop_coke_table01a'];
}

if (typeof window.$ !== 'function') {
    window.$ = function(selector) {
        const el = typeof selector === 'string' ? document.querySelector(selector) : selector;
        return {
            modal(cmd) {
                if (!el) return this;
                if (cmd === 'show') el.classList.add('show');
                if (cmd === 'hide') el.classList.remove('show');
                return this;
            }
        };
    };
}

document.addEventListener('click', (event) => {
    const dismiss = event.target.closest('[data-dismiss="modal"]');
    if (!dismiss) return;
    const modal = dismiss.closest('.modal');
    if (modal) modal.classList.remove('show');
});

function closeAnyOpenModal() {
    const modal = document.querySelector('.modal.show');
    if (!modal) return false;
    modal.classList.remove('show');
    return true;
}

function escapeHtml(value) {
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function normalizeMapEntry(entry) {
    if (typeof entry === 'string') {
        return { name: entry, visible: true, objectCount: 0 };
    }
    const row = entry && typeof entry === 'object' ? entry : {};
    return {
        name: String(row.name || row.id || '').trim(),
        visible: row.visible !== false,
        objectCount: Number(row.objectCount) || 0
    };
}

function safeReadStorageArray(key) {
    try {
        if (typeof localStorage === 'undefined' || !localStorage) return [];
        const raw = localStorage.getItem(String(key || '')) || '[]';
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
        return [];
    }
}

function safeReadJsonFile(paths) {
    const list = Array.isArray(paths) ? paths : [paths];
    for (let i = 0; i < list.length; i += 1) {
        const target = String(list[i] || '').trim();
        if (!target) continue;
        try {
            const xhr = new XMLHttpRequest();
            xhr.open('GET', target, false);
            xhr.send(null);
            if ((xhr.status === 0 || (xhr.status >= 200 && xhr.status < 300)) && xhr.responseText) {
                return JSON.parse(xhr.responseText);
            }
        } catch (_) { }
    }
    return {};
}

function normalizeCategoryMap(rawValue) {
    const src = rawValue && typeof rawValue === 'object' && !Array.isArray(rawValue) ? rawValue : {};
    const out = {};
    Object.keys(src).forEach((key) => {
        const name = String(key || '').trim();
        if (!name) return;
        const items = Array.isArray(src[key]) ? src[key] : [];
        out[name] = [...new Set(items.map((item) => String(item || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    });
    return out;
}

function toFixedSafe(value, digits = 2) {
    const num = Number(value);
    return Number.isFinite(num) ? num.toFixed(digits) : '0.00';
}

function getIcon(name) {
    return window.BuilderIcons && window.BuilderIcons[name] ? window.BuilderIcons[name] : '';
}

const AppState = {
    selectedMapName: '',
    selectedMapObjectCount: 0,
    editorMode: 'panel',
    selectedModelHint: '',
    hasSelectionHint: false,
    customModels: [],
    mapsList: [],
    mapElements: [],
    activeObjects: [],
    selectedObject: null,
    pendingUnsavedMapName: '',
    predefinedCategoryMap: normalizeCategoryMap(safeReadJsonFile([
        './kategoriler.json',
        'kategoriler.json'
    ])),
    categories: safeReadStorageArray('dnzy_categories'),
    favorites: safeReadStorageArray('dnzy_favorites'),
    saveStorage() {
        try {
            if (typeof localStorage === 'undefined' || !localStorage) return;
            localStorage.setItem('dnzy_categories', JSON.stringify(this.categories));
            localStorage.setItem('dnzy_favorites', JSON.stringify(this.favorites));
        } catch (_) { }
    },
    findMap(name) {
        return this.mapsList.find((row) => row.name === name) || null;
    },
    getAllCategories() {
        return [...new Set([...Object.keys(this.predefinedCategoryMap), ...this.categories])]
            .sort((a, b) => a.localeCompare(b));
    },
    getCategoryObjects(categoryName) {
        const fromPredefined = Array.isArray(this.predefinedCategoryMap[categoryName])
            ? this.predefinedCategoryMap[categoryName].map((modelName) => ({
                id: modelName,
                label: modelName,
                model: modelName,
                source: 'predefined'
            }))
            : [];
        const fromFavorites = this.favorites
            .filter((row) => row.category === categoryName)
            .map((row) => ({
                id: row.id,
                label: row.customName || row.model,
                model: row.model,
                source: 'favorite'
            }));
        const merged = [...fromPredefined, ...fromFavorites];
        const seen = new Set();
        return merged.filter((row) => {
            const key = `${String(row.model || row.id)}|${String(row.source || '')}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    },
    isBuiltInCategory(categoryName) {
        return Object.prototype.hasOwnProperty.call(this.predefinedCategoryMap, String(categoryName || ''));
    }
};

if (isBrowserTest) {
    AppState.mapsList = [
        { name: 'dnzyvinewood', visible: true, objectCount: 3 },
        { name: 'test_map_2', visible: false, objectCount: 1 },
        { name: 'gizli_mekan', visible: true, objectCount: 8 }
    ];
    AppState.mapElements = [{ id: 0, modelName: 'prop_boxpile_07d' }, { id: 1, modelName: 'v_ilev_fh_door01' }];
    if (!AppState.categories.length) AppState.categories = ['Ev Esyasi', 'Dis Mekan', 'Silahlar'];
    if (!AppState.favorites.length) {
        AppState.favorites = [
            { id: 'prop_bench_01a', model: 'prop_bench_01a', customName: 'Bank', category: 'Dis Mekan' }
        ];
    }
    AppState.activeObjects = [
        { id: 'ao_demo_1', modelName: 'prop_boxpile_07d', position: { x: 0, y: 0, z: 0 } }
    ];
}

const UI = {
    pageSize: 20,
    currentPage: 1,
    currentListType: null,
    currentListData: [],
    selectedItemId: null,
    filterCategory: null,
    targetModelForCat: null,
    renameTarget: { type: '', id: '' },

    showToast(type, message) {
        const toast = document.getElementById('builder-toast');
        const text = document.getElementById('builder-toast-text');
        if (!toast || !text) return;
        text.textContent = String(message || '');
        toast.className = `builder-toast ${type || 'info'} show`;
        clearTimeout(this._toastTimer);
        this._toastTimer = setTimeout(() => toast.classList.remove('show'), 3000);
    },

    setEditorMode(mode, hasSelection = false, modelName = '') {
        AppState.editorMode = String(mode || 'panel');
        AppState.selectedModelHint = String(modelName || '');
        AppState.hasSelectionHint = hasSelection === true;
        document.body.classList.toggle('panel-mode', AppState.editorMode === 'panel');
        document.body.classList.toggle('placement-mode', AppState.editorMode === 'placement');
        document.body.classList.toggle('freecam-mode', AppState.editorMode === 'freecam');
        document.body.classList.toggle('gizmo-mode', AppState.editorMode === 'gizmo');
        this.updateModeBanner();
        this.updateGuides();
        this.updateControlsBar();
        this.renderSelectedObjectPanel();
    },

    updateModeBanner() {
        const banner = document.getElementById('mode-banner');
        if (!banner) return;

        if (AppState.editorMode === 'gizmo') {
            banner.textContent = 'F2 - CAMERA MOVE';
            return;
        }

        if (AppState.editorMode === 'freecam') {
            banner.textContent = 'F2 - GIZMO MODE';
            return;
        }

        if (AppState.editorMode === 'panel' && (AppState.selectedObject || AppState.hasSelectionHint)) {
            banner.textContent = 'F2 - GIZMO MODE';
            return;
        }

        banner.textContent = 'OBJE SEC';
    },

    updateGuides() {
        const freecamGuide = document.getElementById('freecam-guide');
        const freecamModel = document.getElementById('freecam-guide-model');
        const gizmoGuide = document.getElementById('gizmo-guide');
        const gizmoModel = document.getElementById('gizmo-guide-model');
        const selectedLabel = AppState.selectedObject && AppState.selectedObject.modelName
            ? String(AppState.selectedObject.modelName)
            : String(AppState.selectedModelHint || 'OBJE SECILMEDI');
        const hasSelection = !!AppState.selectedObject || AppState.hasSelectionHint === true;

        if (freecamModel) freecamModel.textContent = `MODEL: ${selectedLabel}`;
        if (gizmoModel) gizmoModel.textContent = `MODEL: ${selectedLabel}`;
        if (freecamGuide) freecamGuide.style.display = AppState.editorMode === 'freecam' && hasSelection ? 'block' : 'none';
        if (gizmoGuide) gizmoGuide.style.display = AppState.editorMode === 'gizmo' && hasSelection ? 'block' : 'none';
    },

    setPlacementMode(active, modelName = '') {
        const helper = document.getElementById('placement-helper');
        const label = document.getElementById('placement-helper-model');
        if (!helper || !label) return;
        helper.style.display = active ? 'block' : 'none';
        label.textContent = modelName ? `MODEL: ${String(modelName)}` : 'MODEL';
        if (active) {
            const rightPanel = document.getElementById('right-panel');
            if (rightPanel) rightPanel.style.display = 'none';
        }
    },

    showCenterWarning(message) {
        const warn = document.getElementById('center-warning');
        if (!warn) return;
        warn.textContent = String(message || '');
        warn.classList.add('show');
        clearTimeout(this._warningTimer);
        this._warningTimer = setTimeout(() => warn.classList.remove('show'), 3000);
    },

    updateControlsBar() {
        const container = document.getElementById('controls-list');
        if (!container) return;

        if (AppState.editorMode === 'gizmo') {
            container.innerHTML = `
                <span><b>Mouse</b> Gizmo ekseni tut</span>
                <span><b>W / R</b> Translate / Rotate</span>
                <span><b>Q</b> Local / World</span>
                <span><b>F2</b> Harici kamera ac/kapat</span>
                <span><b>Enter</b> Panele don</span>
                <span><b>Delete</b> Seciliyi sil</span>
            `;
            return;
        }

        if (AppState.editorMode === 'freecam') {
            container.innerHTML = `
                <span><b>F2</b> Gizmo Mode</span>
                <span><b>W A S D</b> Harici kamera</span>
                <span><b>Q / E</b> Kamera yukseklik</span>
                <span><b>Shift</b> Hizli kamera</span>
                <span><b>Left Alt</b> Zemine Yapistir</span>
                <span><b>C</b> Clone Object</span>
                <span><b>Enter</b> Panele don</span>
            `;
            return;
        }

        container.innerHTML = `
            <span><b>F2</b> Gizmo Mode</span>
            <span><b>Obje Listesi</b> Yeni obje sec</span>
            <span><b>Haritalar</b> Mevcut haritayi ac</span>
            <span><b>Kaydet</b> Haritayi sunucuya yaz</span>
            <span><b>Mouse</b> Panel / liste kullanimi</span>
            <span><b>Delete</b> Secili objeyi sil</span>
        `;
    },

    setSelectedObject(payload) {
        let parsed = payload;
        try {
            if (typeof payload === 'string') parsed = JSON.parse(payload);
        } catch (_) {
            parsed = null;
        }

        AppState.selectedObject = parsed && typeof parsed === 'object' ? parsed : null;
        AppState.hasSelectionHint = !!AppState.selectedObject;
        document.getElementById('right-panel').style.display = 'none';
        this.renderSelectedObjectPanel();
        this.updateGuides();
        this.updateModeBanner();
        this.updateControlsBar();
        this.renderActions();
        if (this.currentListType === 'mapElements' || this.currentListType === 'activeObjects') {
            this.selectedItemId = AppState.selectedObject ? String(AppState.selectedObject.id) : null;
            this.renderList();
        }
    },

    clearSelectedObject() {
        AppState.selectedObject = null;
        AppState.hasSelectionHint = !!AppState.selectedModelHint;
        this.renderSelectedObjectPanel();
        this.updateGuides();
        this.updateModeBanner();
        this.updateControlsBar();
        this.renderActions();
        if (this.currentListType === 'mapElements' || this.currentListType === 'activeObjects') {
            this.selectedItemId = null;
            this.renderList();
        }
    },

    renderSelectedObjectPanel() {
        const panel = document.getElementById('object-edit-panel');
        if (!panel) return;

        if (!AppState.selectedObject || AppState.editorMode === 'gizmo') {
            panel.style.display = 'none';
            return;
        }

        panel.style.display = 'flex';
        document.getElementById('selected-model-name').value = String(AppState.selectedObject.modelName || '');
        document.getElementById('selected-dimensions').textContent = [
            toFixedSafe(AppState.selectedObject.dimensions && AppState.selectedObject.dimensions.width),
            toFixedSafe(AppState.selectedObject.dimensions && AppState.selectedObject.dimensions.depth),
            toFixedSafe(AppState.selectedObject.dimensions && AppState.selectedObject.dimensions.height)
        ].join(' x ');
        document.getElementById('selected-scope').textContent = AppState.selectedObject.draftOnly
            ? 'Draft Object'
            : (AppState.selectedObject.localOnly ? 'Local Object' : 'Persistent');
        document.getElementById('selected-collision').checked = AppState.selectedObject.collision !== false;
        document.getElementById('selected-pos-x').value = toFixedSafe(AppState.selectedObject.position && AppState.selectedObject.position.x);
        document.getElementById('selected-pos-y').value = toFixedSafe(AppState.selectedObject.position && AppState.selectedObject.position.y);
        document.getElementById('selected-pos-z').value = toFixedSafe(AppState.selectedObject.position && AppState.selectedObject.position.z);
        document.getElementById('selected-rot-x').value = toFixedSafe(AppState.selectedObject.rotation && AppState.selectedObject.rotation.x, 1);
        document.getElementById('selected-rot-y').value = toFixedSafe(AppState.selectedObject.rotation && AppState.selectedObject.rotation.y, 1);
        document.getElementById('selected-rot-z').value = toFixedSafe(AppState.selectedObject.rotation && AppState.selectedObject.rotation.z, 1);
    },

    updateSelectedMap(mapName, objectCount) {
        AppState.selectedMapName = String(mapName || '');
        AppState.selectedMapObjectCount = Number(objectCount) || 0;
        const badge = document.getElementById('selected-map-badge');
        if (badge) {
            badge.innerHTML = AppState.selectedMapName
                ? `${getIcon('map')}${escapeHtml(AppState.selectedMapName)} HARİTASI SEÇİLDİ`
                : `${getIcon('map')}HARİTA SEÇİLMEDİ`;
        }
    },

    setMapsList(payload) {
        const parsed = Array.isArray(payload) ? payload : (() => {
            try { return JSON.parse(payload || '[]'); } catch (_) { return []; }
        })();
        AppState.mapsList = Array.isArray(parsed) ? parsed.map(normalizeMapEntry).filter((row) => row.name) : [];
        if (this.currentListType === 'maps') {
            this.openList('maps', this.filterCategory);
        }
    },

    setMapElements(payload) {
        try {
            const parsed = JSON.parse(payload || '[]');
            AppState.mapElements = Array.isArray(parsed) ? parsed : [];
        } catch (_) {
            AppState.mapElements = [];
        }
        AppState.selectedMapObjectCount = AppState.mapElements.length;
        const selected = AppState.findMap(AppState.selectedMapName);
        if (selected) selected.objectCount = AppState.mapElements.length;
        if (AppState.selectedObject) {
            const stillExists = AppState.mapElements.some((entry) => String(entry.id) === String(AppState.selectedObject.id));
            if (!stillExists && (AppState.selectedObject.localOnly || AppState.selectedObject.draftOnly)) this.clearSelectedObject();
        }
        if (this.currentListType === 'mapElements') {
            this.openList('mapElements');
        }
    },

    setCustomModels(payload) {
        try {
            const parsed = Array.isArray(payload) ? payload : JSON.parse(payload || '[]');
            AppState.customModels = Array.isArray(parsed) ? [...new Set(parsed.map((row) => String(row || '').trim()).filter(Boolean))] : [];
        } catch (_) {
            AppState.customModels = [];
        }
        const badge = document.getElementById('custom-model-count');
        if (badge) badge.textContent = String(AppState.customModels.length);
        if (this.currentListType === 'objects' || this.currentListType === 'customModels') {
            this.openList(this.currentListType);
        }
    },

    setActiveObjects(payload) {
        try {
            const parsed = Array.isArray(payload) ? payload : JSON.parse(payload || '[]');
            AppState.activeObjects = Array.isArray(parsed) ? parsed : [];
        } catch (_) {
            AppState.activeObjects = [];
        }
        if (AppState.selectedObject && !AppState.selectedMapName) {
            const stillExists = AppState.activeObjects.some((entry) => String(entry.id) === String(AppState.selectedObject.id));
            if (!stillExists && (AppState.selectedObject.localOnly || AppState.selectedObject.draftOnly)) this.clearSelectedObject();
        }
        if (this.currentListType === 'activeObjects') {
            this.openList('activeObjects');
        }
    },

    buildObjectCatalog() {
        const base = Array.isArray(window.objects) ? window.objects : [];
        return [...new Set([...base, ...AppState.customModels].map((row) => String(row || '').trim()).filter(Boolean))]
            .sort((a, b) => a.localeCompare(b))
            .map((name) => ({ id: name, label: name }));
    },

    openList(type, filter = null) {
        this.currentListType = type;
        this.selectedItemId = null;
        this.filterCategory = filter;
        this.currentPage = 1;
        document.getElementById('panel-search').value = '';
        document.getElementById('object-edit-panel').style.display = 'none';

        let title = '';
        if (type === 'maps') {
            title = 'HARİTALAR';
            this.currentListData = AppState.mapsList.map((row) => ({
                id: row.name,
                label: row.name,
                visible: row.visible,
                objectCount: row.objectCount
            }));
        } else if (type === 'objects') {
            title = 'OBJE LİSTESİ';
            this.currentListData = this.buildObjectCatalog();
        } else if (type === 'customModels') {
            title = 'CUSTOM MODELLER';
            this.currentListData = AppState.customModels.map((row) => ({ id: row, label: row }));
        } else if (type === 'mapElements') {
            title = 'HARİTADAKİ OBJELER';
            this.currentListData = AppState.mapElements.map((entry) => ({
                id: entry.id,
                label: entry.modelName,
                position: entry.position || null,
                localOnly: entry.localOnly === true
            }));
        } else if (type === 'activeObjects') {
            title = 'AKTİF OBJELER';
            this.currentListData = AppState.activeObjects.map((entry) => ({
                id: entry.id,
                label: entry.modelName,
                position: entry.position || null,
                localOnly: entry.localOnly === true
            }));
        } else if (type === 'categories') {
            title = 'KATEGORİLER';
            this.currentListData = AppState.getAllCategories().map((row) => ({ id: row, label: row }));
        } else if (type === 'categoryObjects') {
            title = `KATEGORİ: ${filter || ''}`;
            this.currentListData = AppState.getCategoryObjects(filter);
        } else if (type === 'favorites') {
            title = filter ? `FAVORİLER: ${filter}` : 'TÜM FAVORİLER';
            let list = AppState.favorites;
            if (filter) list = list.filter((row) => row.category === filter);
            this.currentListData = list.map((row) => ({ id: row.id, label: row.customName || row.model, model: row.model }));
        }

        document.getElementById('panel-title').textContent = title;
        document.getElementById('right-panel').style.display = 'flex';
        this.renderList();
        this.renderActions();
    },

    closeList() {
        document.getElementById('right-panel').style.display = 'none';
        const active = document.activeElement;
        if (active && typeof active.blur === 'function') active.blur();
        mp.events.call('client:builder:textInputFocus', false);
        mp.events.call('client:exitPreview');
    },

    handleSearch() {
        this.currentPage = 1;
        this.renderList();
    },

    renderList() {
        const term = String(document.getElementById('panel-search').value || '').toLowerCase();
        const container = document.getElementById('panel-list');
        const pager = document.getElementById('panel-pagination');
        const prevBtn = document.getElementById('panel-prev-page');
        const nextBtn = document.getElementById('panel-next-page');
        const pageIndicator = document.getElementById('panel-page-indicator');
        container.innerHTML = '';

        const filtered = this.currentListData.filter((item) => String(item.label || '').toLowerCase().includes(term));
        if (!filtered.length) {
            pager.style.display = 'none';
            container.innerHTML = '<div style="text-align:center; margin-top:30px; color:#666; font-weight:900;">BULUNAMADI</div>';
            return;
        }

        const totalPages = Math.max(1, Math.ceil(filtered.length / this.pageSize));
        if (this.currentPage > totalPages) this.currentPage = totalPages;
        if (this.currentPage < 1) this.currentPage = 1;
        const startIndex = (this.currentPage - 1) * this.pageSize;
        const visibleItems = filtered.slice(startIndex, startIndex + this.pageSize);

        pager.style.display = totalPages > 1 ? 'flex' : 'none';
        pageIndicator.textContent = `${this.currentPage} / ${totalPages}`;
        prevBtn.disabled = this.currentPage <= 1;
        nextBtn.disabled = this.currentPage >= totalPages;
        prevBtn.onclick = () => {
            if (this.currentPage <= 1) return;
            this.currentPage -= 1;
            this.renderList();
        };
        nextBtn.onclick = () => {
            if (this.currentPage >= totalPages) return;
            this.currentPage += 1;
            this.renderList();
        };

        visibleItems.forEach((item) => {
            const div = document.createElement('div');
            div.className = `builder-list-item ${this.selectedItemId === item.id ? 'active' : ''}`;
            div.addEventListener('click', () => this.selectItem(item.id));

            if (this.currentListType === 'maps') {
                const mapInfo = AppState.findMap(item.id);
                div.innerHTML = `
                    <span class="item-name">${escapeHtml(item.label)} <small>#${Number(item.objectCount) || 0} • ${mapInfo && mapInfo.visible === false ? 'KAPALI' : 'AÇIK'}</small></span>
                    <div class="item-actions">
                        <button class="btn-row btn-git" type="button" data-action="goto" data-id="${escapeHtml(item.id)}">GİT</button>
                        <button class="btn-row btn-obj" type="button" data-action="objects" data-id="${escapeHtml(item.id)}">SEÇ</button>
                    </div>
                `;
            } else if (this.currentListType === 'objects' || this.currentListType === 'customModels') {
                const isFav = AppState.favorites.find((row) => row.id === item.id);
                div.innerHTML = `
                    <div class="item-actions">
                        <button class="btn-row btn-fav ${isFav ? 'active' : ''}" type="button" data-action="fav" data-id="${escapeHtml(item.id)}" title="Favorilere Ekle/Çıkar">${isFav ? getIcon('starFill') : getIcon('star')}</button>
                        <button class="btn-row btn-cat" type="button" data-action="cat" data-id="${escapeHtml(item.id)}" title="Kategoriye Ekle">${getIcon('folder')}</button>
                    </div>
                    <span class="item-name">${escapeHtml(item.label)}</span>
                `;
            } else if (this.currentListType === 'favorites' || this.currentListType === 'categoryObjects') {
                const fav = AppState.favorites.find((row) => row.id === item.id);
                div.innerHTML = `
                    <span class="item-name">${escapeHtml(item.label)} <small>${escapeHtml(item.model || (fav && fav.model) || '')}</small></span>
                `;
            } else if (this.currentListType === 'mapElements' || this.currentListType === 'activeObjects') {
                div.innerHTML = `
                    <span class="item-name">${escapeHtml(item.label)} <small>${item.draftOnly ? 'DRAFT' : (item.localOnly ? 'LOCAL' : 'PERSISTENT')}</small></span>
                    <div class="item-actions">
                        <button class="btn-row btn-git" type="button" data-action="goto-object" data-id="${escapeHtml(String(item.id))}">GİT</button>
                    </div>
                `;
            } else {
                div.innerHTML = `<span class="item-name">${escapeHtml(item.label)}</span>`;
            }

            container.appendChild(div);
        });

        container.querySelectorAll('[data-action="goto"]').forEach((button) => {
            button.addEventListener('click', (event) => {
                event.stopPropagation();
                this.actionMap('goto', button.dataset.id || '');
            });
        });
        container.querySelectorAll('[data-action="objects"]').forEach((button) => {
            button.addEventListener('click', (event) => {
                event.stopPropagation();
                this.actionMap('objects', button.dataset.id || '');
            });
        });
        container.querySelectorAll('[data-action="fav"]').forEach((button) => {
            button.addEventListener('click', (event) => {
                event.stopPropagation();
                this.toggleFav(button.dataset.id || '');
            });
        });
        container.querySelectorAll('[data-action="cat"]').forEach((button) => {
            button.addEventListener('click', (event) => {
                event.stopPropagation();
                this.openCategorySelect(button.dataset.id || '');
            });
        });
        container.querySelectorAll('[data-action="goto-object"]').forEach((button) => {
            button.addEventListener('click', (event) => {
                event.stopPropagation();
                this.gotoObject(button.dataset.id || '');
            });
        });
    },

    selectItem(id) {
        this.selectedItemId = id;
        this.renderList();
        this.renderActions();

        if (this.currentListType === 'objects' || this.currentListType === 'customModels') {
            mp.events.call('client:objectPreview', id);
        } else if (this.currentListType === 'favorites') {
            const fav = AppState.favorites.find((row) => row.id === id);
            if (fav) mp.events.call('client:objectPreview', fav.model);
        } else if (this.currentListType === 'categoryObjects') {
            const entry = this.currentListData.find((row) => row.id === id);
            if (entry) mp.events.call('client:objectPreview', entry.model || entry.id);
        } else if (this.currentListType === 'mapElements' || this.currentListType === 'activeObjects') {
            const entry = this.currentListData.find((row) => String(row.id) === String(id));
            if (entry && (entry.localOnly || entry.draftOnly)) {
                mp.events.call('client:elementFocus', String(id));
            } else if (entry) {
                this.showToast('info', 'Persistent active objects can be saved or teleported, local objects can be edited.');
            }
        }
    },

    renderActions() {
        const container = document.getElementById('panel-actions');
        container.innerHTML = '';
        const id = this.selectedItemId;

        if (this.currentListType === 'maps' && id) {
            const entry = AppState.findMap(id);
            const isVisible = !entry || entry.visible !== false;
            container.innerHTML = `
                <button class="btn btn-sil" type="button" onclick="UI.actionMap('delete', '${escapeHtml(id)}')">SİL</button>
                <button class="btn btn-isim" type="button" onclick="UI.openRename('map', '${escapeHtml(id)}')">İSİM DEĞİŞTİR</button>
                <button class="btn ${isVisible ? 'btn-kapat' : 'btn-ac'}" type="button" onclick="UI.actionMap('toggle', '${escapeHtml(id)}')">${isVisible ? 'KAPAT' : 'AÇ'}</button>
            `;
        } else if (this.currentListType === 'categories') {
            container.innerHTML = '<button class="btn btn-ekle" type="button" onclick="$(\'#dialog-add-category\').modal(\'show\')">EKLE</button>';
            if (id) {
                container.innerHTML += `
                    <button class="btn btn-sil" type="button" onclick="UI.deleteCategory('${escapeHtml(id)}')">SİL</button>
                    <button class="btn btn-gir" type="button" onclick="UI.openList('categoryObjects', '${escapeHtml(id)}')">GİR</button>
                `;
            }
        } else if (this.currentListType === 'favorites' && id) {
            container.innerHTML = `
                <button class="btn btn-sil" type="button" onclick="UI.toggleFav('${escapeHtml(id)}')">SİL</button>
                <button class="btn btn-isim" type="button" onclick="UI.openRename('fav', '${escapeHtml(id)}')">İSİM DEĞİŞTİR</button>
                <button class="btn btn-yerlestir" type="button" onclick="UI.placeCurrent()">YERLEŞTİR</button>
            `;
        } else if (this.currentListType === 'categoryObjects' && id) {
            container.innerHTML = '<button class="btn btn-yerlestir" type="button" onclick="UI.placeCurrent()">YERLEŞTİR</button>';
        } else if ((this.currentListType === 'objects' || this.currentListType === 'customModels') && id) {
            container.innerHTML = '<button class="btn btn-yerlestir" type="button" onclick="UI.placeCurrent()">YERLEŞTİR</button>';
        } else if (this.currentListType === 'mapElements' && id) {
            container.innerHTML = `
                <button class="btn btn-sil" type="button" onclick="UI.deleteMapElement('${escapeHtml(id)}')">SİL</button>
                <button class="btn btn-gir" type="button" onclick="UI.gotoObject('${escapeHtml(id)}')">GİT</button>
            `;
        } else if (this.currentListType === 'activeObjects' && id) {
            container.innerHTML = `
                <button class="btn btn-gir" type="button" onclick="UI.gotoObject('${escapeHtml(id)}')">GİT</button>
                <button class="btn btn-sil" type="button" onclick="UI.deleteActiveObject('${escapeHtml(id)}')">SİL</button>
            `;
        }
    },

    placeCurrent() {
        let model = this.selectedItemId;
        let sourceList = this.currentListType;
        if (this.currentListType === 'favorites') {
            const fav = AppState.favorites.find((row) => row.id === this.selectedItemId);
            if (fav) model = fav.model;
        } else if (this.currentListType === 'categoryObjects') {
            const entry = this.currentListData.find((row) => row.id === this.selectedItemId);
            if (entry) model = entry.model || entry.id;
        }
        if (!model) return;

        mp.events.call('client:objectSelected', model, sourceList || 'objects');
        this.showToast('success', `${model} yerlestirme moduna alindi.`);
        this.closeList();
    },

    actionMap(action, mapName) {
        const entry = AppState.findMap(mapName);
        if (action === 'goto') {
            mp.events.call('client:gotoMap', mapName);
            this.showToast('info', `${mapName} haritasına ışınlanılıyor.`);
        } else if (action === 'objects') {
            AppState.selectedMapName = mapName;
            mp.events.call('client:requestMapOpen', mapName);
            this.openList('mapElements');
        } else if (action === 'delete') {
            mp.events.call('client:requestMapDelete', mapName);
            this.showToast('info', `${mapName} silme isteği gönderildi.`);
        } else if (action === 'toggle') {
            const nextVisible = !(entry && entry.visible === false);
            if (entry) entry.visible = !nextVisible;
            mp.events.call('client:toggleMapVisibility', mapName, !nextVisible);
            this.showToast('info', `${mapName} ${!nextVisible ? 'görünür' : 'gizli'} yapılıyor.`);
            this.renderList();
            this.renderActions();
        }
    },

    gotoObject(id) {
        const sourceList = this.currentListType === 'activeObjects'
            ? AppState.activeObjects
            : AppState.mapElements;
        const entry = sourceList.find((row) => String(row.id) === String(id));
        if (!entry || !entry.position) {
            this.showToast('error', 'Obje konumu bulunamadı.');
            return;
        }
        mp.events.call('client:gotoBuilderObject', JSON.stringify({
            modelName: entry.modelName || entry.label || 'Obje',
            position: entry.position
        }));
        this.showToast('info', `${entry.modelName || 'Obje'} konumuna gidildi.`);
    },

    deleteActiveObject(id) {
        mp.events.call('client:deleteActiveObject', String(id || ''));
        this.showToast('info', 'Aktif obje silme isteği gönderildi.');
    },

    toggleFav(modelId) {
        const idx = AppState.favorites.findIndex((row) => row.id === modelId);
        if (idx > -1) {
            AppState.favorites.splice(idx, 1);
            this.showToast('info', 'Favorilerden çıkarıldı.');
        } else {
            AppState.favorites.push({ id: modelId, model: modelId, customName: modelId, category: '' });
            this.showToast('success', 'Favorilere eklendi.');
        }
        AppState.saveStorage();
        this.renderList();
        this.renderActions();
    },

    deleteMapElement(id) {
        mp.events.call('client:elementFocus', String(id));
        mp.events.call('client:confirmObjectDelete');
        this.showToast('info', 'Obje silindi.');
        this.closeList();
    },

    openCategorySelect(modelId) {
        this.targetModelForCat = modelId;
        const select = document.getElementById('select-category-dropdown');
        select.innerHTML = '<option value="">Kategori Yok</option>' +
            AppState.getAllCategories().map((row) => `<option value="${escapeHtml(row)}">${escapeHtml(row)}</option>`).join('');

        const fav = AppState.favorites.find((row) => row.id === modelId);
        if (fav) select.value = fav.category || '';
        $('#dialog-select-category').modal('show');
    },

    confirmAssignCategory() {
        const select = document.getElementById('select-category-dropdown');
        const category = String(select.value || '');
        let fav = AppState.favorites.find((row) => row.id === this.targetModelForCat);
        if (!fav) {
            fav = { id: this.targetModelForCat, model: this.targetModelForCat, customName: this.targetModelForCat, category };
            AppState.favorites.push(fav);
        } else {
            fav.category = category;
        }
        AppState.saveStorage();
        $('#dialog-select-category').modal('hide');
        this.showToast('success', 'Kategori atandı.');
        this.renderList();
    },

    confirmAddCategory() {
        const input = document.getElementById('add-category-name');
        const name = String(input.value || '').trim();
        if (!name) return;
        if (!AppState.categories.includes(name)) {
            AppState.categories.push(name);
            AppState.saveStorage();
            this.showToast('success', 'Kategori eklendi.');
        }
        input.value = '';
        $('#dialog-add-category').modal('hide');
        if (this.currentListType === 'categories') this.openList('categories');
    },

    deleteCategory(categoryName) {
        if (AppState.isBuiltInCategory(categoryName)) {
            this.showToast('error', 'Hazır kategori silinemez.');
            return;
        }
        AppState.categories = AppState.categories.filter((row) => row !== categoryName);
        AppState.favorites.forEach((row) => {
            if (row.category === categoryName) row.category = '';
        });
        AppState.saveStorage();
        this.showToast('info', 'Kategori silindi.');
        this.openList('categories');
    },

    openRename(type, id) {
        this.renameTarget = { type, id };
        const input = document.getElementById('rename-input');
        input.value = id;
        if (type === 'fav') {
            const fav = AppState.favorites.find((row) => row.id === id);
            if (fav) input.value = fav.customName || fav.model;
        }
        $('#dialog-rename').modal('show');
    },

    confirmRename() {
        const input = document.getElementById('rename-input');
        const newName = String(input.value || '').trim();
        if (!newName) return;

        if (this.renameTarget.type === 'map') {
            mp.events.call('client:requestMapRename', this.renameTarget.id, newName);
            this.showToast('success', 'Harita ismi değiştirme isteği gönderildi.');
            if (AppState.selectedMapName === this.renameTarget.id) {
                AppState.selectedMapName = newName;
            }
        } else if (this.renameTarget.type === 'fav') {
            const fav = AppState.favorites.find((row) => row.id === this.renameTarget.id);
            if (fav) fav.customName = newName;
            AppState.saveStorage();
            this.showToast('success', 'Favori ismi değiştirildi.');
        }
        $('#dialog-rename').modal('hide');
        this.openList(this.currentListType || 'favorites', this.filterCategory);
    },

    openCreateMapDialog() {
        document.getElementById('create-map-name').value = AppState.pendingUnsavedMapName || '';
        $('#dialog-create-map').modal('show');
    },

    confirmCreateMap() {
        const input = document.getElementById('create-map-name');
        const name = String(input.value || '').trim();
        if (!name) return;
        this.updateSelectedMap(name, 0);
        mp.events.call('client:requestNewMap', false, name);
        $('#dialog-create-map').modal('hide');
        this.showToast('success', `Yeni harita oluşturuldu: ${name}`);
    },

    saveCurrentMap() {
        mp.events.call('client:requestMapSave', AppState.selectedMapName || '');
        this.showToast('success', AppState.selectedMapName ? 'Harita kaydedildi.' : 'Aktif objeler kaydediliyor.');
    },

    addCustomModel(event) {
        if (event) event.preventDefault();
        const input = document.getElementById('custom-model-name');
        const name = String(input.value || '').trim();
        if (!name) return;
        mp.events.call('client:requestAddCustomModel', name);
        input.value = '';
        this.showToast('success', 'Model ekleme isteği gönderildi.');
        $('#dialog-add-model').modal('hide');
    },

    exitEditor() {
        mp.events.call('client:requestExit');
        $('#dialog-exit-editor').modal('hide');
    },

    applySelectedObjectEdits() {
        if (!AppState.selectedObject) return;
        const payload = {
            position: {
                x: Number(document.getElementById('selected-pos-x').value),
                y: Number(document.getElementById('selected-pos-y').value),
                z: Number(document.getElementById('selected-pos-z').value)
            },
            rotation: {
                x: Number(document.getElementById('selected-rot-x').value),
                y: Number(document.getElementById('selected-rot-y').value),
                z: Number(document.getElementById('selected-rot-z').value)
            },
            collision: document.getElementById('selected-collision').checked
        };
        mp.events.call('client:objectEdit:apply', JSON.stringify(payload));
    },

    deleteSelectedObject() {
        if (!AppState.selectedObject) return;
        mp.events.call('client:confirmObjectDelete');
    },

    reopenPlacementSelection(sourceListType, modelName) {
        const allowed = ['favorites', 'objects', 'customModels', 'categoryObjects'];
        const type = allowed.includes(sourceListType) ? sourceListType : 'objects';
        this.openList(type, this.filterCategory);
        this.selectedItemId = modelName;
        this.renderList();
        this.renderActions();
    }
};

window.UI = UI;

UI.setEditorMode('panel', false, '');

document.getElementById('selected-collision').addEventListener('change', (event) => {
    mp.events.call('client:objectEdit:setCollision', !!event.target.checked);
});

let lastCursorX = 0.5;
let lastCursorY = 0.5;

function getPointerPayload(event) {
    const width = Math.max(window.innerWidth || 1, 1);
    const height = Math.max(window.innerHeight || 1, 1);
    const x = Math.min(Math.max(event.clientX / width, 0), 1);
    const y = Math.min(Math.max(event.clientY / height, 0), 1);
    const overUi = !!event.target.closest('.editor-ui, #right-panel, #object-edit-panel, .controls-bottom-bar, .modal, #placement-helper');

    return { x, y, overUi };
}

function isWorldGizmoMode() {
    return document.body.classList.contains('gizmo-mode');
}

document.addEventListener('mousemove', (event) => {
    const { x, y, overUi } = getPointerPayload(event);
    mp.events.call('client:builder:cursorUpdate', JSON.stringify({
        x,
        y,
        dx: x - lastCursorX,
        dy: y - lastCursorY,
        overUi
    }));

    lastCursorX = x;
    lastCursorY = y;
});

document.addEventListener('mousedown', (event) => {
    const { x, y, overUi } = getPointerPayload(event);
    mp.events.call('client:builder:pointerDown', JSON.stringify({ x, y, button: event.button, overUi }));
});

document.addEventListener('mouseup', (event) => {
    const { x, y, overUi } = getPointerPayload(event);
    mp.events.call('client:builder:pointerUp', JSON.stringify({ x, y, button: event.button, overUi }));
});

mp.events.call('client:builder:editorStarted');

mp.events.add('cef:setMapsList', (payload) => {
    UI.setMapsList(payload);
});

mp.events.add('cef:clearMapsList', () => {
    AppState.mapsList = [];
    if (UI.currentListType === 'maps') UI.openList('maps');
});

mp.events.add('cef:addMapsListItem', (mapName) => {
    AppState.mapsList.push(normalizeMapEntry(mapName));
    if (UI.currentListType === 'maps') UI.openList('maps');
});

mp.events.add('cef:setCursorVisible', (isVisible) => {
});

mp.events.add('cef:setEditorMode', (mode, hasSelection, modelName) => {
    UI.setEditorMode(mode, !!hasSelection, String(modelName || ''));
});

mp.events.add('cef:forceInputBlur', () => {
    const active = document.activeElement;
    if (active && typeof active.blur === 'function') {
        active.blur();
    }
    try { mp.events.call('client:builder:textInputFocus', false); } catch (_) { }
});

mp.events.add('cef:setWorldCursor', (isVisible, x = 0.5, y = 0.5) => {
    const cursor = document.getElementById('world-cursor');
    if (!cursor) return;
    cursor.style.display = 'none';
});

mp.events.add('cef:setMapElements', (payload) => {
    UI.setMapElements(payload);
});

mp.events.add('cef:setCustomModels', (payload) => {
    UI.setCustomModels(payload);
});

mp.events.add('cef:setActiveObjects', (payload) => {
    UI.setActiveObjects(payload);
});

mp.events.add('cef:onMapSelected', (mapName, objectCount) => {
    UI.updateSelectedMap(mapName, objectCount);
});

mp.events.add('cef:onMapLoaded', (mapName, loadedCount, skippedCount) => {
    UI.updateSelectedMap(mapName, loadedCount);
    const row = AppState.findMap(String(mapName || ''));
    if (row) row.objectCount = Number(loadedCount) || 0;
    if (UI.currentListType === 'maps') UI.openList('maps');
    if (Number(skippedCount) > 0) {
        UI.showToast('error', `${loadedCount} obje yüklendi, ${skippedCount} model atlandı.`);
    } else {
        UI.showToast('success', `Harita yüklendi: ${mapName} (${loadedCount} obje)`);
    }
});

mp.events.add('cef:onMapDeleted', (mapName) => {
    const deleted = String(mapName || '');
    AppState.mapsList = AppState.mapsList.filter((row) => row.name !== deleted);
    if (AppState.selectedMapName === deleted) {
        UI.updateSelectedMap('', 0);
        AppState.mapElements = [];
    }
    if (UI.currentListType === 'maps') UI.openList('maps');
    UI.showToast('success', `Harita silindi: ${deleted}`);
});

mp.events.add('cef:onActiveObjectsDeleted', (_objectId, payload) => {
    UI.setActiveObjects(payload);
    UI.showToast('success', 'Aktif obje silindi.');
});

mp.events.add('cef:setPlacementMode', (active, modelName) => {
    UI.setPlacementMode(!!active, String(modelName || ''));
});

mp.events.add('cef:setSelectedObject', (payload) => {
    UI.setSelectedObject(payload);
});

mp.events.add('cef:clearSelectedObject', () => {
    UI.clearSelectedObject();
});

mp.events.add('cef:notify', (type, message) => {
    UI.showToast(type || 'info', message || '');
});

mp.events.add('cef:showNewMapNameDialog', () => {
    UI.openCreateMapDialog();
});

mp.events.add('cef:showNewMapIgnoreUnsavedDialog', (pendingName = '') => {
    AppState.pendingUnsavedMapName = String(pendingName || '');
    UI.showCenterWarning('Kaydedilmemiş obje var. Önce kaydet ya da tekrar yeni oluştur.');
});

mp.events.add('cef:showObjectDeleteDialog', () => {
    mp.events.call('client:confirmObjectDelete');
});

mp.events.add('cef:reopenPlacementSelection', (sourceListType, modelName) => {
    UI.reopenPlacementSelection(String(sourceListType || 'objects'), String(modelName || ''));
});

mp.events.add('cef:builderHandleEscape', () => {
    if (closeAnyOpenModal()) {
        try { mp.events.call('client:builder:textInputFocus', false); } catch (_) { }
        return;
    }
    const rightPanel = document.getElementById('right-panel');
    if (rightPanel && rightPanel.style.display === 'flex') {
        UI.closeList();
    }
});

document.addEventListener('focusin', (event) => {
    const target = event.target;
    const isTextTarget = !!(target && (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable
    ));
    mp.events.call('client:builder:textInputFocus', isTextTarget);
});

document.addEventListener('focusout', () => {
    const active = document.activeElement;
    const stillTextTarget = !!(active && (
        active.tagName === 'INPUT' ||
        active.tagName === 'TEXTAREA' ||
        active.tagName === 'SELECT' ||
        active.isContentEditable
    ));
    mp.events.call('client:builder:textInputFocus', stillTextTarget);
});
window.addEventListener('beforeunload', () => {
    try { mp.events.call('client:builder:textInputFocus', false); } catch (_) { }
});
