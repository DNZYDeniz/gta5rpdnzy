local Shared = BuilderShared

local RESOURCE_NAME = GetCurrentResourceName()
local RESOURCE_PATH = GetResourcePath(RESOURCE_NAME)
local EVENT_SERVER = Shared.EVENT_SERVER
local EVENT_CLIENT = Shared.EVENT_CLIENT

local MAPS_DIR_REL = 'data/maps'
local CUSTOM_MODELS_FILE_REL = 'data/custom-models.json'
local ACTIVE_MAP_FILE_REL = ('%s/%s.json'):format(MAPS_DIR_REL, Shared.ACTIVE_MAP_NAME)
local REQUIRE_ACE_CONVAR = RESOURCE_NAME .. '_requireAce'
local ACE_PERMISSION = RESOURCE_NAME .. '.use'

local state = {
    mapsCatalog = {},
    customModels = {},
    activeObjects = {},
    mapCache = {},
    worldObjects = {},
    worldRevision = 0,
    editorSessions = {}
}

local function logInfo(message)
    print(('[%s] %s'):format(RESOURCE_NAME, message))
end

local function decodeJson(raw, fallback)
    if type(raw) ~= 'string' or raw == '' then
        return fallback
    end

    local ok, parsed = pcall(json.decode, raw)
    if not ok or type(parsed) ~= 'table' then
        return fallback
    end

    return parsed
end

local function encodeJson(value)
    local ok, out = pcall(json.encode, value)
    if not ok or type(out) ~= 'string' then
        return '[]'
    end

    return out
end

local function saveResourceJson(path, payload)
    local raw = encodeJson(payload)
    if #raw > Shared.MAX_MAP_SIZE_BYTES and path:sub(1, #MAPS_DIR_REL) == MAPS_DIR_REL then
        return false, 'payload_too_large'
    end

    SaveResourceFile(RESOURCE_NAME, path, raw, -1)
    return true
end

local function readResourceJson(path, fallback)
    local raw = LoadResourceFile(RESOURCE_NAME, path)
    return decodeJson(raw, fallback)
end

local function ensureDataFiles()
    if not LoadResourceFile(RESOURCE_NAME, CUSTOM_MODELS_FILE_REL) then
        SaveResourceFile(RESOURCE_NAME, CUSTOM_MODELS_FILE_REL, '[]', -1)
    end

    if not LoadResourceFile(RESOURCE_NAME, ACTIVE_MAP_FILE_REL) then
        local emptyActive = {
            name = Shared.ACTIVE_MAP_NAME,
            visible = true,
            elements = {}
        }
        SaveResourceFile(RESOURCE_NAME, ACTIVE_MAP_FILE_REL, encodeJson(emptyActive), -1)
    end
end

local function listMapFiles()
    local files = {}
    local isWindows = string.find(RESOURCE_PATH, '\\', 1, true) ~= nil
    local command

    if isWindows then
        command = ('dir /b "%s"'):format((RESOURCE_PATH .. '\\data\\maps'))
    else
        command = ('ls -1 "%s"'):format((RESOURCE_PATH .. '/data/maps'))
    end

    local ioPopen = type(io) == 'table' and io.popen or nil
    if type(ioPopen) ~= 'function' then
        return files
    end

    local pipe = ioPopen(command)
    if not pipe then
        return files
    end

    for line in pipe:lines() do
        if type(line) == 'string' and line:lower():sub(-5) == '.json' then
            files[#files + 1] = line
        end
    end

    pipe:close()
    table.sort(files)
    return files
end

local function mapFilePath(mapName)
    return ('%s/%s.json'):format(MAPS_DIR_REL, Shared.sanitizeMapName(mapName))
end

local function deleteMapFile(mapName)
    local cleanName = Shared.sanitizeMapName(mapName)
    if cleanName == '' then
        return false
    end

    -- FiveM Lua runtime does not expose os.remove reliably, so clear file content.
    SaveResourceFile(RESOURCE_NAME, mapFilePath(cleanName), '', -1)
    return true
end

local function buildMapCatalogEntry(mapData, fallbackName)
    local mapName = Shared.sanitizeMapName(mapData and mapData.name or fallbackName or '')
    local elements = Shared.normalizeElements(mapData and mapData.elements or {})
    local firstPosition = nil

    for index = 1, #elements do
        local row = elements[index]
        if row and row.position then
            firstPosition = {
                x = row.position.x,
                y = row.position.y,
                z = row.position.z
            }
            break
        end
    end

    return {
        name = mapName,
        visible = mapData and mapData.visible ~= false or true,
        objectCount = #elements,
        firstPosition = firstPosition
    }
end

local function normalizeMapPayload(mapName, payload)
    local cleanName = Shared.sanitizeMapName(mapName or payload and payload.name or '')
    if cleanName == '' then
        return nil
    end

    return {
        name = cleanName,
        visible = payload and payload.visible ~= false or true,
        elements = Shared.normalizeElements(payload and payload.elements or {})
    }
end

local function loadMapData(mapName)
    local cleanName = Shared.sanitizeMapName(mapName)
    if cleanName == '' then
        return nil
    end

    if state.mapCache[cleanName] then
        return Shared.deepCopy(state.mapCache[cleanName])
    end

    local path = mapFilePath(cleanName)
    local parsed = readResourceJson(path, nil)
    if type(parsed) ~= 'table' then
        return nil
    end

    local normalized = normalizeMapPayload(cleanName, parsed)
    if not normalized then
        return nil
    end

    state.mapCache[cleanName] = normalized
    return Shared.deepCopy(normalized)
end

local function writeMapData(mapName, payload)
    local normalized = normalizeMapPayload(mapName, payload)
    if not normalized then
        return nil, 'invalid_map_name'
    end

    local ok, reason = saveResourceJson(mapFilePath(normalized.name), normalized)
    if not ok then
        return nil, reason
    end

    state.mapCache[normalized.name] = Shared.deepCopy(normalized)
    return normalized
end

local function readCustomModels()
    local parsed = readResourceJson(CUSTOM_MODELS_FILE_REL, {})
    local out = {}
    local exists = {}

    for index = 1, #parsed do
        local modelName = Shared.normalizeModelName(parsed[index])
        if modelName ~= '' and not exists[modelName] then
            exists[modelName] = true
            out[#out + 1] = modelName
        end
    end

    table.sort(out)
    state.customModels = out
end

local function writeCustomModels()
    saveResourceJson(CUSTOM_MODELS_FILE_REL, state.customModels)
end

local function readActiveObjects()
    local parsed = readResourceJson(ACTIVE_MAP_FILE_REL, {
        name = Shared.ACTIVE_MAP_NAME,
        visible = true,
        elements = {}
    })

    local normalized = normalizeMapPayload(Shared.ACTIVE_MAP_NAME, parsed) or {
        name = Shared.ACTIVE_MAP_NAME,
        visible = true,
        elements = {}
    }

    state.activeObjects = normalized.elements
    saveResourceJson(ACTIVE_MAP_FILE_REL, normalized)
end

local function writeActiveObjects(elements)
    local normalized = normalizeMapPayload(Shared.ACTIVE_MAP_NAME, {
        name = Shared.ACTIVE_MAP_NAME,
        visible = true,
        elements = elements
    })

    if not normalized then
        return false
    end

    state.activeObjects = normalized.elements
    saveResourceJson(ACTIVE_MAP_FILE_REL, normalized)
    return true
end

local function rebuildMapsCatalog()
    local files = listMapFiles()
    local catalog = {}
    local activeFileName = Shared.ACTIVE_MAP_NAME .. '.json'

    for index = 1, #files do
        local fileName = files[index]
        if fileName ~= activeFileName then
            local mapName = fileName:gsub('%.json$', '')
            local mapData = loadMapData(mapName)
            if mapData then
                catalog[#catalog + 1] = buildMapCatalogEntry(mapData, mapName)
            end
        end
    end

    table.sort(catalog, function(a, b)
        return tostring(a.name) < tostring(b.name)
    end)

    state.mapsCatalog = catalog
end

local function rebuildWorldObjects()
    local combined = {}
    local dedupe = {}

    local function pushObject(prefix, objectEntry)
        if not objectEntry or objectEntry.visible == false then
            return
        end

        local mapId = Shared.sanitizeKey(prefix .. ':' .. tostring(objectEntry.id or Shared.makeObjectId('obj')), 140)
        if dedupe[mapId] then
            return
        end
        dedupe[mapId] = true

        combined[#combined + 1] = {
            id = mapId,
            sourceId = objectEntry.id,
            source = prefix,
            modelName = objectEntry.modelName,
            position = objectEntry.position,
            rotation = objectEntry.rotation,
            collision = objectEntry.collision ~= false
        }
    end

    for index = 1, #state.activeObjects do
        pushObject('active', state.activeObjects[index])
    end

    for index = 1, #state.mapsCatalog do
        local mapMeta = state.mapsCatalog[index]
        if mapMeta and mapMeta.visible ~= false then
            local mapData = loadMapData(mapMeta.name)
            if mapData then
                for elementIndex = 1, #mapData.elements do
                    pushObject('map_' .. mapMeta.name, mapData.elements[elementIndex])
                end
            end
        end
    end

    state.worldRevision = state.worldRevision + 1
    state.worldObjects = combined
end

local function pushStateToClients(target)
    TriggerClientEvent(EVENT_CLIENT .. ':statePush', target or -1, state.mapsCatalog, state.customModels, state.activeObjects)
end

local function pushWorldToClients(target)
    TriggerClientEvent(EVENT_CLIENT .. ':worldSync', target or -1, state.worldObjects, state.worldRevision)
end

local function notifyClient(source, notifyType, message)
    TriggerClientEvent(EVENT_CLIENT .. ':notify', source, notifyType or 'info', message or '')
end

local function canUseBuilder(source)
    local requireAce = GetConvarInt(REQUIRE_ACE_CONVAR, 0) == 1
    if not requireAce then
        return true
    end

    return IsPlayerAceAllowed(source, ACE_PERMISSION)
end

local function refreshAllState()
    readCustomModels()
    readActiveObjects()
    rebuildMapsCatalog()
    rebuildWorldObjects()
end

RegisterNetEvent(EVENT_SERVER .. ':requestOpenEditor', function()
    local src = source
    if not canUseBuilder(src) then
        notifyClient(src, 'error', 'Map builder yetkin yok.')
        return
    end

    state.editorSessions[src] = true
    TriggerClientEvent(EVENT_CLIENT .. ':openEditor', src, state.mapsCatalog, state.customModels, state.activeObjects)
end)

RegisterNetEvent(EVENT_SERVER .. ':requestCloseEditor', function()
    state.editorSessions[source] = nil
end)

RegisterNetEvent(EVENT_SERVER .. ':requestWorldSync', function()
    pushWorldToClients(source)
end)

RegisterNetEvent(EVENT_SERVER .. ':requestWorkspaceData', function(workspaceType, workspaceName)
    local src = source
    if not canUseBuilder(src) then
        notifyClient(src, 'error', 'Map builder yetkin yok.')
        return
    end

    local cleanType = tostring(workspaceType or 'active') == 'map' and 'map' or 'active'
    if cleanType == 'active' then
        TriggerClientEvent(EVENT_CLIENT .. ':workspaceData', src, 'active', Shared.ACTIVE_MAP_NAME, state.activeObjects, true)
        return
    end

    local cleanName = Shared.sanitizeMapName(workspaceName)
    if cleanName == '' then
        notifyClient(src, 'error', 'Gecersiz harita adi.')
        return
    end

    local mapData = loadMapData(cleanName)
    if not mapData then
        notifyClient(src, 'error', 'Harita bulunamadi.')
        return
    end

    TriggerClientEvent(EVENT_CLIENT .. ':workspaceData', src, 'map', cleanName, mapData.elements, mapData.visible ~= false)
end)

RegisterNetEvent(EVENT_SERVER .. ':saveWorkspace', function(workspaceType, workspaceName, rawElements)
    local src = source
    if not canUseBuilder(src) then
        notifyClient(src, 'error', 'Map builder yetkin yok.')
        return
    end

    local cleanType = tostring(workspaceType or 'active') == 'map' and 'map' or 'active'
    local normalizedElements = Shared.normalizeElements(type(rawElements) == 'table' and rawElements or {})

    if cleanType == 'active' then
        writeActiveObjects(normalizedElements)
        rebuildWorldObjects()
        pushStateToClients(-1)
        pushWorldToClients(-1)
        notifyClient(src, 'success', 'Aktif objeler kaydedildi.')
        return
    end

    local cleanName = Shared.sanitizeMapName(workspaceName)
    if cleanName == '' then
        notifyClient(src, 'error', 'Harita ismi bos olamaz.')
        return
    end

    local previousMap = loadMapData(cleanName)
    local previousVisible = previousMap and previousMap.visible ~= false or true
    local savedMap, reason = writeMapData(cleanName, {
        name = cleanName,
        visible = previousVisible,
        elements = normalizedElements
    })

    if not savedMap then
        notifyClient(src, 'error', ('Harita kaydedilemedi (%s).'):format(reason or 'unknown'))
        return
    end

    rebuildMapsCatalog()
    rebuildWorldObjects()
    pushStateToClients(-1)
    pushWorldToClients(-1)
    notifyClient(src, 'success', ('Harita kaydedildi: %s'):format(cleanName))
end)

RegisterNetEvent(EVENT_SERVER .. ':deleteMap', function(mapName)
    local src = source
    if not canUseBuilder(src) then
        notifyClient(src, 'error', 'Map builder yetkin yok.')
        return
    end

    local cleanName = Shared.sanitizeMapName(mapName)
    if cleanName == '' or cleanName == Shared.ACTIVE_MAP_NAME then
        notifyClient(src, 'error', 'Bu harita silinemez.')
        return
    end

    if not loadMapData(cleanName) then
        notifyClient(src, 'error', 'Harita bulunamadi.')
        return
    end

    deleteMapFile(cleanName)
    state.mapCache[cleanName] = nil

    rebuildMapsCatalog()
    rebuildWorldObjects()
    pushStateToClients(-1)
    pushWorldToClients(-1)
    TriggerClientEvent(EVENT_CLIENT .. ':mapDeleted', -1, cleanName)
    notifyClient(src, 'success', ('Harita silindi: %s'):format(cleanName))
end)

RegisterNetEvent(EVENT_SERVER .. ':renameMap', function(oldName, newName)
    local src = source
    if not canUseBuilder(src) then
        notifyClient(src, 'error', 'Map builder yetkin yok.')
        return
    end

    local cleanOld = Shared.sanitizeMapName(oldName)
    local cleanNew = Shared.sanitizeMapName(newName)
    if cleanOld == '' or cleanNew == '' then
        notifyClient(src, 'error', 'Harita ismi gecersiz.')
        return
    end

    if cleanOld == Shared.ACTIVE_MAP_NAME or cleanNew == Shared.ACTIVE_MAP_NAME then
        notifyClient(src, 'error', 'Bu isim kullanilamaz.')
        return
    end

    local mapData = loadMapData(cleanOld)
    if not mapData then
        notifyClient(src, 'error', 'Harita bulunamadi.')
        return
    end

    if loadMapData(cleanNew) then
        notifyClient(src, 'error', 'Bu isimde harita zaten var.')
        return
    end

    mapData.name = cleanNew
    local saved = writeMapData(cleanNew, mapData)
    if not saved then
        notifyClient(src, 'error', 'Yeni harita dosyasi olusturulamadi.')
        return
    end

    deleteMapFile(cleanOld)
    state.mapCache[cleanOld] = nil

    rebuildMapsCatalog()
    rebuildWorldObjects()
    pushStateToClients(-1)
    pushWorldToClients(-1)
    TriggerClientEvent(EVENT_CLIENT .. ':mapRenamed', -1, cleanOld, cleanNew)
    notifyClient(src, 'success', ('Harita yeniden adlandirildi: %s'):format(cleanNew))
end)

RegisterNetEvent(EVENT_SERVER .. ':toggleMapVisibility', function(mapName, visible)
    local src = source
    if not canUseBuilder(src) then
        notifyClient(src, 'error', 'Map builder yetkin yok.')
        return
    end

    local cleanName = Shared.sanitizeMapName(mapName)
    local mapData = loadMapData(cleanName)
    if not mapData then
        notifyClient(src, 'error', 'Harita bulunamadi.')
        return
    end

    mapData.visible = visible ~= false
    writeMapData(cleanName, mapData)

    rebuildMapsCatalog()
    rebuildWorldObjects()
    pushStateToClients(-1)
    pushWorldToClients(-1)
    notifyClient(src, 'success', ('Harita durumu guncellendi: %s'):format(cleanName))
end)

RegisterNetEvent(EVENT_SERVER .. ':addCustomModel', function(modelName)
    local src = source
    if not canUseBuilder(src) then
        notifyClient(src, 'error', 'Map builder yetkin yok.')
        return
    end

    local cleanModel = Shared.normalizeModelName(modelName)
    if cleanModel == '' then
        notifyClient(src, 'error', 'Model adi gecersiz.')
        return
    end

    for index = 1, #state.customModels do
        if state.customModels[index] == cleanModel then
            notifyClient(src, 'info', 'Model zaten listede.')
            return
        end
    end

    state.customModels[#state.customModels + 1] = cleanModel
    table.sort(state.customModels)
    writeCustomModels()
    pushStateToClients(-1)
    notifyClient(src, 'success', ('Model eklendi: %s'):format(cleanModel))
end)

RegisterNetEvent(EVENT_SERVER .. ':deleteActiveObject', function(objectId)
    local src = source
    if not canUseBuilder(src) then
        notifyClient(src, 'error', 'Map builder yetkin yok.')
        return
    end

    local cleanId = Shared.sanitizeKey(objectId, 96)
    if cleanId == '' then
        return
    end

    local filtered = {}
    local removed = false
    for index = 1, #state.activeObjects do
        local row = state.activeObjects[index]
        if row and row.id == cleanId then
            removed = true
        else
            filtered[#filtered + 1] = row
        end
    end

    if not removed then
        notifyClient(src, 'error', 'Aktif obje bulunamadi.')
        return
    end

    writeActiveObjects(filtered)
    rebuildWorldObjects()
    pushStateToClients(-1)
    pushWorldToClients(-1)
    TriggerClientEvent(EVENT_CLIENT .. ':activeObjectDeleted', -1, cleanId, state.activeObjects)
    notifyClient(src, 'success', 'Aktif obje silindi.')
end)

AddEventHandler('playerDropped', function()
    state.editorSessions[source] = nil
end)

AddEventHandler('onResourceStart', function(resourceName)
    if resourceName ~= RESOURCE_NAME then
        return
    end

    ensureDataFiles()
    refreshAllState()
    logInfo(('loaded maps=%d active=%d custom=%d'):format(#state.mapsCatalog, #state.activeObjects, #state.customModels))
end)
