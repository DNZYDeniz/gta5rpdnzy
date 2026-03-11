local Shared = BuilderShared

local EVENT_SERVER = Shared.EVENT_SERVER
local EVENT_CLIENT = Shared.EVENT_CLIENT

local KEY_F2 = 289
local KEY_DELETE = 178
local KEY_BACKSPACE = 177
local KEY_ESCAPE = 322
local KEY_ENTER = 191
local KEY_LEFT_CLICK = 24
local KEY_CLONE = 26
local KEY_FORWARD = 32
local KEY_BACK = 33
local KEY_LEFT = 34
local KEY_RIGHT = 35
local KEY_UP = 38
local KEY_DOWN = 44
local KEY_FAST = 21
local KEY_SNAP_TO_GROUND = 19

local EDITOR_MODE_PANEL = 'panel'
local EDITOR_MODE_FREECAM = 'freecam'
local EDITOR_MODE_GIZMO = 'gizmo'

local BLOCKED_CONTROLS = {
    25, 37, 45, 68, 69, 70, 91, 92, 140, 141, 142, 143, 144,
    157, 158, 159, 160, 161, 162, 163, 164, 165, 263, 264
}

local HIDDEN_HUD_COMPONENTS = { 1, 2, 3, 4, 6, 7, 8, 9, 13, 14, 15, 16, 17, 19, 20, 22 }

local dataviewChunk = assert(load(LoadResourceFile(GetCurrentResourceName(), 'gizmo_dataview.lua'), '@gizmo_dataview.lua'))
local dataview = dataviewChunk()
local hasSelectedEntry

local state = {
    editorOpen = false,
    editorMode = EDITOR_MODE_PANEL,
    cursorVisible = false,
    gizmoDragging = false,
    textInputFocused = false,
    selectedDraftId = nil,
    workspaceType = 'active',
    workspaceName = Shared.ACTIVE_MAP_NAME,
    selectedMapName = '',
    mapsCatalog = {},
    customModels = {},
    serverActiveObjects = {},
    draftObjects = {},
    draftById = {},
    draftByEntity = {},
    draftDirty = false,
    pendingPlacement = nil,
    sourceListType = 'objects',
    worldObjects = {},
    worldById = {},
    worldEntities = {},
    worldStreamingPaused = false,
    worldRevision = 0,
    selectedUiNextSyncAt = 0,
    lastIdleCamInvalidate = 0,
    gizmoCursorNative = false,
    gizmoCameraMove = false,
    externalCam = 0
}

local previewState = {
    entity = 0,
    focusActive = false
}

local playerStateBackup = {
    valid = false,
    visible = true
}

local function notifyFeed(message)
    BeginTextCommandThefeedPost('STRING')
    AddTextComponentSubstringPlayerName(tostring(message or ''))
    EndTextCommandThefeedPostTicker(false, false)
end

local function isControlJustPressedSafe(control)
    return IsControlJustPressed(0, control) or IsDisabledControlJustPressed(0, control)
end

local function isControlPressedSafe(control)
    return IsControlPressed(0, control) or IsDisabledControlPressed(0, control)
end

local function sendUi(eventName, ...)
    SendNUIMessage({
        event = eventName,
        args = { ... }
    })
end

local function setUiVisible(visible)
    sendUi('ui:setVisible', visible == true)
end

local function applyNuiFocus(hasFocus, hasCursor, keepInput)
    SetNuiFocus(hasFocus == true, hasCursor == true)
    if SetNuiFocusKeepInput then
        SetNuiFocusKeepInput(keepInput == true)
    end
end

local function logCursorState(reason)
    print(('[%s] %s mode=%s nativeCursor=%s cursorVisible=%s dragging=%s'):format(
        Shared.RESOURCE_NAME,
        tostring(reason),
        tostring(state.editorMode),
        tostring(state.gizmoCursorNative == true),
        tostring(state.cursorVisible == true),
        tostring(state.gizmoDragging == true)
    ))
end

local function logInputOwnership(modeName, hasFocus, hasCursor, keepInput, nativeCursor)
    print(('[%s] ownership=%s nuiFocus=%s cursor=%s keepInput=%s nativeCursor=%s'):format(
        Shared.RESOURCE_NAME,
        tostring(modeName),
        tostring(hasFocus == true),
        tostring(hasCursor == true),
        tostring(keepInput == true),
        tostring(nativeCursor == true)
    ))
end

local function disableGizmoCursor()
    pcall(function()
        LeaveCursorMode()
    end)
    state.gizmoCursorNative = false
    state.gizmoDragging = false
    print(('[arderumapbuilder] disableGizmoCursor mode=%s nativeCursor=%s cursorVisible=%s camMove=%s'):format(
        tostring(state.editorMode), tostring(state.gizmoCursorNative), tostring(state.cursorVisible), tostring(state.gizmoCameraMove)
    ))
end

local function enableGizmoCursor()
    state.gizmoCursorNative = false
    local ok = pcall(function()
        EnterCursorMode()
        SetCursorLocation(0.5, 0.5)
    end)
    if ok then
        state.gizmoCursorNative = true
    end
    print(('[arderumapbuilder] enableGizmoCursor mode=%s nativeCursor=%s cursorVisible=%s camMove=%s'):format(
        tostring(state.editorMode), tostring(state.gizmoCursorNative), tostring(state.cursorVisible), tostring(state.gizmoCameraMove)
    ))
end

local function applyPanelInputOwnership()
    disableGizmoCursor()
    state.cursorVisible = true
    applyNuiFocus(true, true, false)
    sendUi('cef:setCursorVisible', true)
    sendUi('cef:setWorldCursor', false, 0.5, 0.5)
    logInputOwnership('panel', true, true, false, false)
end

local function applyFreecamInputOwnership()
    disableGizmoCursor()
    state.cursorVisible = false
    applyNuiFocus(false, false, false)
    sendUi('cef:setCursorVisible', false)
    sendUi('cef:setWorldCursor', false, 0.5, 0.5)
    logInputOwnership('freecam', false, false, false, false)
end

local function applyGizmoInputOwnership()
    applyNuiFocus(false, false, false)
    enableGizmoCursor()
    state.cursorVisible = true
    sendUi('cef:setCursorVisible', true)
    logInputOwnership('gizmo', false, false, false, state.gizmoCursorNative)
end

local function maintainGizmoCursor()
    local shouldOwnCursor =
        state.editorOpen
        and state.editorMode == EDITOR_MODE_GIZMO
        and not state.gizmoCameraMove
        and hasSelectedEntry()
    print(('[arderumapbuilder] maintainGizmoCursor should=%s mode=%s nativeCursor=%s cursorVisible=%s camMove=%s'):format(
        tostring(shouldOwnCursor), tostring(state.editorMode), tostring(state.gizmoCursorNative), tostring(state.cursorVisible), tostring(state.gizmoCameraMove)
    ))
    if not shouldOwnCursor then
        if state.gizmoCursorNative then
            disableGizmoCursor()
        end
        return
    end
    if not state.gizmoCursorNative then
        enableGizmoCursor()
        return
    end
    pcall(function()
        EnterCursorMode()
    end)
end

local function decodeJson(payload, fallback)
    if type(payload) ~= 'string' or payload == '' then
        return fallback
    end

    local ok, parsed = pcall(json.decode, payload)
    if not ok then
        return fallback
    end

    return parsed
end

local function encodeJson(payload, fallback)
    local ok, encoded = pcall(json.encode, payload)
    if not ok then
        return fallback or '[]'
    end
    return encoded
end

local function getCameraDirection()
    local rotation = GetGameplayCamRot(2)
    local rotX = math.rad(rotation.x)
    local rotZ = math.rad(rotation.z)
    local cosX = math.abs(math.cos(rotX))

    return {
        x = -math.sin(rotZ) * cosX,
        y = math.cos(rotZ) * cosX,
        z = math.sin(rotX)
    }
end

local function rotationToDirection(rotation)
    local rotX = math.rad(rotation.x or rotation[1] or 0.0)
    local rotZ = math.rad(rotation.z or rotation[3] or 0.0)
    local cosX = math.abs(math.cos(rotX))

    return {
        x = -math.sin(rotZ) * cosX,
        y = math.cos(rotZ) * cosX,
        z = math.sin(rotX)
    }
end

local function getModelBoundsDataFromHash(modelHash)
    local empty = {
        min = { x = 0.0, y = 0.0, z = 0.0 },
        max = { x = 0.0, y = 0.0, z = 0.0 },
        center = { x = 0.0, y = 0.0, z = 0.0 },
        size = { x = 0.0, y = 0.0, z = 0.0 },
        maxSize = 0.0,
        radius = 0.35
    }

    if not modelHash or modelHash == 0 then
        return empty
    end

    local minDim, maxDim = GetModelDimensions(modelHash)
    local minX = minDim.x or minDim[1] or 0.0
    local minY = minDim.y or minDim[2] or 0.0
    local minZ = minDim.z or minDim[3] or 0.0
    local maxX = maxDim.x or maxDim[1] or 0.0
    local maxY = maxDim.y or maxDim[2] or 0.0
    local maxZ = maxDim.z or maxDim[3] or 0.0
    local sizeX = math.abs(maxX - minX)
    local sizeY = math.abs(maxY - minY)
    local sizeZ = math.abs(maxZ - minZ)
    local maxSize = math.max(sizeX, math.max(sizeY, sizeZ))
    local radius = math.sqrt((sizeX * sizeX) + (sizeY * sizeY) + (sizeZ * sizeZ)) * 0.5

    return {
        min = { x = minX, y = minY, z = minZ },
        max = { x = maxX, y = maxY, z = maxZ },
        center = {
            x = (minX + maxX) * 0.5,
            y = (minY + maxY) * 0.5,
            z = (minZ + maxZ) * 0.5
        },
        size = { x = sizeX, y = sizeY, z = sizeZ },
        maxSize = maxSize,
        radius = math.max(radius, 0.35)
    }
end

local function getModelBoundsRadiusFromHash(modelHash)
    return getModelBoundsDataFromHash(modelHash).radius
end

local function getFitDistanceForRadius(radius, fov)
    local safeRadius = math.max(radius or 1.0, 0.35)
    local safeFov = math.max(fov or 30.0, 10.0)
    local half = math.rad(safeFov * 0.5)
    local base = safeRadius / math.tan(half)
    return Shared.clamp((base * 1.22) + (safeRadius * 0.8), 2.0, 280.0)
end

local function getEntityFocusData(entity)
    if not entity or entity == 0 or not DoesEntityExist(entity) then
        return nil
    end

    local bounds = getModelBoundsDataFromHash(GetEntityModel(entity))
    local worldCenter = GetOffsetFromEntityInWorldCoords(
        entity,
        bounds.center.x,
        bounds.center.y,
        bounds.center.z
    )

    bounds.worldCenter = {
        x = worldCenter.x or worldCenter[1] or 0.0,
        y = worldCenter.y or worldCenter[2] or 0.0,
        z = worldCenter.z or worldCenter[3] or 0.0
    }

    return bounds
end

local function getFitDistanceForBounds(bounds, fov)
    local safeBounds = type(bounds) == 'table' and bounds or {}
    local radius = math.max(safeBounds.radius or 0.35, 0.35)
    local maxSize = math.max(safeBounds.maxSize or radius, radius)
    local safeFov = math.max(fov or 30.0, 10.0)
    local half = math.rad(safeFov * 0.5)
    local base = radius / math.tan(half)
    return Shared.clamp(base + (maxSize * 0.85) + 1.4, 2.5, 420.0)
end

local function destroyExternalCamera()
    if state.externalCam and state.externalCam ~= 0 and DoesCamExist(state.externalCam) then
        RenderScriptCams(false, false, 0, true, true)
        DestroyCam(state.externalCam, false)
    end
    if previewState.focusActive then
        ClearFocus()
        previewState.focusActive = false
    end
    state.externalCam = 0
    state.gizmoCameraMove = false
end

local function ensureExternalCamera()
    if state.externalCam and state.externalCam ~= 0 and DoesCamExist(state.externalCam) then
        return
    end

    local cam = CreateCam('DEFAULT_SCRIPTED_CAMERA', true)
    local camPos = GetGameplayCamCoord()
    local camRot = GetGameplayCamRot(2)

    SetCamCoord(cam, camPos.x or camPos[1], camPos.y or camPos[2], camPos.z or camPos[3])
    SetCamRot(cam, camRot.x or camRot[1], camRot.y or camRot[2], camRot.z or camRot[3], 2)
    SetCamActive(cam, true)
    RenderScriptCams(true, false, 0, true, true)
    state.externalCam = cam
end

local function frameCameraOnEntity(cam, entity, options)
    if not cam or cam == 0 or not DoesCamExist(cam) then
        return false
    end

    local focus = getEntityFocusData(entity)
    if not focus then
        return false
    end

    local opts = type(options) == 'table' and options or {}
    local targetFov = Shared.clamp(Shared.toNumber(opts.fov, 28.0), 16.0, 70.0)
    local targetHeading = Shared.toNumber(opts.heading, (GetEntityHeading(entity) or 0.0) + 35.0)
    local targetPitch = Shared.clamp(Shared.toNumber(opts.pitch, -20.0), -89.0, 89.0)
    local distance = getFitDistanceForBounds(focus, targetFov)
    distance = distance * Shared.clamp(Shared.toNumber(opts.distanceMultiplier, 1.0), 0.75, 2.2)
    distance = distance + Shared.toNumber(opts.distanceOffset, 0.0)

    local direction = rotationToDirection({
        x = targetPitch,
        y = 0.0,
        z = targetHeading
    })
    local targetCenter = focus.worldCenter

    SetCamCoord(
        cam,
        targetCenter.x - (direction.x * distance),
        targetCenter.y - (direction.y * distance),
        targetCenter.z - (direction.z * distance)
    )
    PointCamAtCoord(cam, targetCenter.x, targetCenter.y, targetCenter.z)
    SetCamFov(cam, targetFov)
    SetCamFarClip(cam, math.max(2500.0, distance * 8.0))

    return true
end

local function focusExternalCameraOnSelection(resetPosition)
    if not state.externalCam or state.externalCam == 0 or not DoesCamExist(state.externalCam) then
        return
    end

    local selected = state.selectedDraftId and state.draftById[state.selectedDraftId] or nil
    if not selected or not selected.entity or selected.entity == 0 or not DoesEntityExist(selected.entity) then
        return
    end

    if resetPosition then
        frameCameraOnEntity(state.externalCam, selected.entity, {
            fov = 24.0,
            pitch = -22.0,
            heading = (GetEntityHeading(selected.entity) or 0.0) + 34.0,
            distanceMultiplier = 1.08
        })
        return
    end

    local focus = getEntityFocusData(selected.entity)
    if focus then
        PointCamAtCoord(state.externalCam, focus.worldCenter.x, focus.worldCenter.y, focus.worldCenter.z)
    end
end

local function updateExternalCameraMovement()
    if not state.externalCam or state.externalCam == 0 or not DoesCamExist(state.externalCam) then
        return
    end

    applyNuiFocus(false, false, false)
    disableGizmoCursor()

    pcall(function()
        StopCamPointing(state.externalCam)
    end)

    DisableControlAction(0, 1, true)
    DisableControlAction(0, 2, true)
    DisableControlAction(0, 24, true)
    DisableControlAction(0, 25, true)
    DisableControlAction(0, KEY_LEFT_CLICK, true)
    DisableControlAction(0, 30, true)
    DisableControlAction(0, 31, true)
    DisableControlAction(0, 32, true)
    DisableControlAction(0, 33, true)
    DisableControlAction(0, 34, true)
    DisableControlAction(0, 35, true)
    DisableControlAction(0, 36, true)
    DisableControlAction(0, 44, true)
    DisableControlAction(1, 30, true)
    DisableControlAction(1, 31, true)
    DisableControlAction(2, 30, true)
    DisableControlAction(2, 31, true)
    DisablePlayerFiring(PlayerId(), true)
    SetEntityVelocity(PlayerPedId(), 0.0, 0.0, 0.0)

    local camPos = GetCamCoord(state.externalCam)
    local camRot = GetCamRot(state.externalCam, 2)
    SetCamFov(state.externalCam, 58.0)

    local lookX = GetDisabledControlNormal(0, 1)
    local lookY = GetDisabledControlNormal(0, 2)
    if math.abs(lookX) < 0.0001 then
        lookX = GetControlNormal(0, 1)
    end
    if math.abs(lookY) < 0.0001 then
        lookY = GetControlNormal(0, 2)
    end
    local nextRotX = Shared.clamp((camRot.x or camRot[1]) - (lookY * 6.0), -89.0, 89.0)
    local nextRotY = camRot.y or camRot[2] or 0.0
    local nextRotZ = (camRot.z or camRot[3]) - (lookX * 9.0)
    SetCamRot(state.externalCam, nextRotX, nextRotY, nextRotZ, 2)

    local direction = rotationToDirection({ x = nextRotX, y = nextRotY, z = nextRotZ })
    local right = {
        x = -direction.y,
        y = direction.x,
        z = 0.0
    }

    local speed = isControlPressedSafe(KEY_FAST) and 1.15 or 0.42
    local x = camPos.x or camPos[1]
    local y = camPos.y or camPos[2]
    local z = camPos.z or camPos[3]

    if isControlPressedSafe(KEY_FORWARD) then
        x = x + (direction.x * speed)
        y = y + (direction.y * speed)
        z = z + (direction.z * speed)
    end
    if isControlPressedSafe(KEY_BACK) then
        x = x - (direction.x * speed)
        y = y - (direction.y * speed)
        z = z - (direction.z * speed)
    end
    if isControlPressedSafe(KEY_LEFT) then
        x = x + (right.x * speed)
        y = y + (right.y * speed)
    end
    if isControlPressedSafe(KEY_RIGHT) then
        x = x - (right.x * speed)
        y = y - (right.y * speed)
    end
    if isControlPressedSafe(KEY_DOWN) then
        z = z + speed
    end
    if isControlPressedSafe(KEY_UP) then
        z = z - speed
    end

    SetCamCoord(state.externalCam, x, y, z)
end

local function distanceSquared(a, b)
    local dx = (a.x or a[1] or 0.0) - (b.x or b[1] or 0.0)
    local dy = (a.y or a[2] or 0.0) - (b.y or b[2] or 0.0)
    local dz = (a.z or a[3] or 0.0) - (b.z or b[3] or 0.0)
    return (dx * dx) + (dy * dy) + (dz * dz)
end

local function loadModel(modelName, timeoutMs)
    local hash = GetHashKey(modelName)
    if hash == 0 or not IsModelInCdimage(hash) or not IsModelValid(hash) then
        return nil
    end

    RequestModel(hash)
    local deadline = GetGameTimer() + (timeoutMs or 5000)
    while not HasModelLoaded(hash) do
        Wait(0)
        if GetGameTimer() > deadline then
            return nil
        end
    end

    return hash
end

local function deleteEntitySafe(entity)
    if entity and entity ~= 0 and DoesEntityExist(entity) then
        SetEntityAsMissionEntity(entity, true, true)
        DeleteEntity(entity)
    end
end

local function spawnObjectAt(entry, isWorldObject)
    local modelHash = loadModel(entry.modelName, 5000)
    if not modelHash then
        return 0
    end

    local obj = CreateObjectNoOffset(
        modelHash,
        entry.position.x,
        entry.position.y,
        entry.position.z,
        false,
        false,
        false
    )

    if obj == 0 then
        SetModelAsNoLongerNeeded(modelHash)
        return 0
    end

    SetEntityRotation(obj, entry.rotation.x, entry.rotation.y, entry.rotation.z, 2, true)
    FreezeEntityPosition(obj, true)
    SetEntityCollision(obj, entry.collision ~= false, entry.collision ~= false)
    SetEntityInvincible(obj, true)
    SetEntityAsMissionEntity(obj, true, true)
    SetEntityDynamic(obj, false)

    SetModelAsNoLongerNeeded(modelHash)
    return obj
end

local function applyDraftFreezeState()
    local selectedId = state.selectedDraftId
    local gizmoMode = state.editorMode == EDITOR_MODE_GIZMO

    for index = 1, #state.draftObjects do
        local entry = state.draftObjects[index]
        if entry and entry.entity and entry.entity ~= 0 and DoesEntityExist(entry.entity) then
            local allowEdit = gizmoMode and selectedId and entry.id == selectedId
            FreezeEntityPosition(entry.entity, not allowEdit)
            SetEntityDynamic(entry.entity, false)
        end
    end
end

local function clearPreviewObject()
    if previewState.entity ~= 0 then
        deleteEntitySafe(previewState.entity)
        previewState.entity = 0
    end
    if previewState.focusActive then
        ClearFocus()
        previewState.focusActive = false
    end
end

local function clearWorldEntities()
    for _, entity in pairs(state.worldEntities) do
        deleteEntitySafe(entity)
    end
    state.worldEntities = {}
end

local function rebuildDraftIndexes()
    state.draftById = {}
    state.draftByEntity = {}

    for index = 1, #state.draftObjects do
        local entry = state.draftObjects[index]
        if entry then
            state.draftById[entry.id] = entry
            if entry.entity and entry.entity ~= 0 then
                state.draftByEntity[entry.entity] = entry
            end
        end
    end
end

local function updateDraftEntryFromEntity(entry)
    if not entry or not entry.entity or entry.entity == 0 or not DoesEntityExist(entry.entity) then
        return
    end

    local coords = GetEntityCoords(entry.entity)
    local rotation = GetEntityRotation(entry.entity, 2)

    entry.position = {
        x = coords.x or coords[1],
        y = coords.y or coords[2],
        z = coords.z or coords[3]
    }
    entry.rotation = {
        x = rotation.x or rotation[1],
        y = rotation.y or rotation[2],
        z = rotation.z or rotation[3]
    }
    entry.collision = entry.collision ~= false
end

local function collectDraftElements()
    local out = {}
    for index = 1, #state.draftObjects do
        local entry = state.draftObjects[index]
        if entry then
            updateDraftEntryFromEntity(entry)
            local normalized = Shared.validateObject(entry, entry.id)
            if normalized then
                out[#out + 1] = normalized
            end
        end
    end
    return out
end

local function buildDraftUiList()
    local list = {}
    for index = 1, #state.draftObjects do
        local entry = state.draftObjects[index]
        if entry then
            updateDraftEntryFromEntity(entry)
            list[#list + 1] = {
                id = entry.id,
                localOnly = false,
                draftOnly = true,
                modelName = entry.modelName,
                position = entry.position,
                rotation = entry.rotation,
                collision = entry.collision ~= false,
                visible = true
            }
        end
    end
    return list
end

local function buildActiveUiList()
    if state.workspaceType == 'active' then
        return buildDraftUiList()
    end

    local out = {}
    for index = 1, #state.serverActiveObjects do
        local row = state.serverActiveObjects[index]
        if row then
            out[#out + 1] = {
                id = row.id,
                modelName = row.modelName,
                position = row.position,
                rotation = row.rotation,
                collision = row.collision ~= false,
                localOnly = false,
                draftOnly = false
            }
        end
    end
    return out
end

local function getEntryDimensions(entry)
    local hash = GetHashKey(entry.modelName)
    if hash == 0 then
        return { width = 0.0, depth = 0.0, height = 0.0 }
    end

    local minDim, maxDim = GetModelDimensions(hash)
    local minX = minDim.x or minDim[1] or 0.0
    local minY = minDim.y or minDim[2] or 0.0
    local minZ = minDim.z or minDim[3] or 0.0
    local maxX = maxDim.x or maxDim[1] or 0.0
    local maxY = maxDim.y or maxDim[2] or 0.0
    local maxZ = maxDim.z or maxDim[3] or 0.0

    return {
        width = math.abs(maxX - minX),
        depth = math.abs(maxY - minY),
        height = math.abs(maxZ - minZ)
    }
end

hasSelectedEntry = function()
    local entry = state.selectedDraftId and state.draftById[state.selectedDraftId] or nil
    if not entry or not entry.entity or entry.entity == 0 or not DoesEntityExist(entry.entity) then
        return false
    end
    return true
end

local function getSelectedEntry()
    if not state.selectedDraftId then
        return nil
    end
    return state.draftById[state.selectedDraftId]
end

local function syncMapsCatalogToUi()
    sendUi('cef:setMapsList', encodeJson(state.mapsCatalog, '[]'))
end

local function syncCustomModelsToUi()
    sendUi('cef:setCustomModels', encodeJson(state.customModels, '[]'))
end

local function syncActiveObjectsToUi()
    sendUi('cef:setActiveObjects', encodeJson(buildActiveUiList(), '[]'))
end

local function syncMapElementsToUi()
    if state.workspaceType == 'map' then
        sendUi('cef:setMapElements', encodeJson(buildDraftUiList(), '[]'))
    else
        sendUi('cef:setMapElements', '[]')
    end
end

local function clearSelectedObjectUi()
    sendUi('cef:clearSelectedObject')
end

local function syncSelectedObjectToUi(force)
    if not hasSelectedEntry() then
        clearSelectedObjectUi()
        return
    end

    if not force and GetGameTimer() < state.selectedUiNextSyncAt then
        return
    end
    state.selectedUiNextSyncAt = GetGameTimer() + 120

    local entry = getSelectedEntry()
    updateDraftEntryFromEntity(entry)

    local payload = {
        id = entry.id,
        localOnly = false,
        draftOnly = true,
        modelName = entry.modelName,
        position = entry.position,
        rotation = entry.rotation,
        collision = entry.collision ~= false,
        dimensions = getEntryDimensions(entry)
    }
    sendUi('cef:setSelectedObject', encodeJson(payload, '{}'))
end

local function getSelectedModelName()
    local entry = getSelectedEntry()
    if entry then
        return entry.modelName
    end
    return ''
end

local function syncEditorModeToUi()
    sendUi('cef:setEditorMode', state.editorMode, hasSelectedEntry(), getSelectedModelName())
end

local function setSelectedDraftById(draftId, forceSync)
    if not draftId or draftId == '' then
        state.selectedDraftId = nil
        clearSelectedObjectUi()
        syncEditorModeToUi()
        return
    end

    local entry = state.draftById[draftId]
    if not entry or not entry.entity or entry.entity == 0 or not DoesEntityExist(entry.entity) then
        state.selectedDraftId = nil
        clearSelectedObjectUi()
        syncEditorModeToUi()
        return
    end

    state.selectedDraftId = draftId
    applyDraftFreezeState()
    focusExternalCameraOnSelection(true)
    syncSelectedObjectToUi(forceSync == true)
    syncEditorModeToUi()
end

local function clearDraftObjects()
    for index = 1, #state.draftObjects do
        local entry = state.draftObjects[index]
        if entry then
            deleteEntitySafe(entry.entity)
        end
    end

    state.draftObjects = {}
    state.draftById = {}
    state.draftByEntity = {}
    state.selectedDraftId = nil
    state.pendingPlacement = nil
    state.draftDirty = false

    clearSelectedObjectUi()
end

local function addDraftObject(rawObject, selectIt, markDirty)
    local cleanObject = Shared.validateObject(rawObject, rawObject.id or Shared.makeObjectId('draft'))
    if not cleanObject then
        return nil
    end

    local entity = spawnObjectAt(cleanObject, false)
    if entity == 0 then
        return nil
    end

    cleanObject.entity = entity
    state.draftObjects[#state.draftObjects + 1] = cleanObject
    rebuildDraftIndexes()

    if markDirty then
        state.draftDirty = true
    end

    if selectIt then
        setSelectedDraftById(cleanObject.id, true)
    end

    return cleanObject
end

local function removeDraftObjectById(draftId, markDirty)
    local removed = false
    local filtered = {}
    for index = 1, #state.draftObjects do
        local entry = state.draftObjects[index]
        if entry and entry.id == draftId then
            deleteEntitySafe(entry.entity)
            removed = true
        else
            filtered[#filtered + 1] = entry
        end
    end

    state.draftObjects = filtered
    rebuildDraftIndexes()

    if state.selectedDraftId == draftId then
        state.selectedDraftId = nil
        clearSelectedObjectUi()
    end

    if removed and markDirty then
        state.draftDirty = true
    end

    return removed
end

local function cloneSelectedObject()
    local entry = getSelectedEntry()
    if not entry then
        return
    end

    updateDraftEntryFromEntity(entry)
    local cameraDirection = getCameraDirection()
    local copy = {
        id = Shared.makeObjectId('draft'),
        modelName = entry.modelName,
        position = {
            x = entry.position.x + (cameraDirection.x * 1.0),
            y = entry.position.y + (cameraDirection.y * 1.0),
            z = entry.position.z
        },
        rotation = {
            x = entry.rotation.x,
            y = entry.rotation.y,
            z = entry.rotation.z
        },
        collision = entry.collision ~= false,
        visible = true
    }

    local created = addDraftObject(copy, true, true)
    if created then
        notifyFeed('~g~Obje kopyalandi.')
        syncMapElementsToUi()
        syncActiveObjectsToUi()
    end
end

local function snapSelectedToGround()
    local entry = getSelectedEntry()
    if not entry or not DoesEntityExist(entry.entity) then
        return false
    end

    local coords = GetEntityCoords(entry.entity)
    local rotation = GetEntityRotation(entry.entity, 2)
    local heading = rotation.z or rotation[3] or 0.0
    local modelHash = GetEntityModel(entry.entity)
    local minDim = { x = 0.0, y = 0.0, z = 0.0 }
    local maxDim = { x = 0.0, y = 0.0, z = 0.0 }
    if modelHash and modelHash ~= 0 then
        minDim, maxDim = GetModelDimensions(modelHash)
    end

    local baseX = coords.x or coords[1]
    local baseY = coords.y or coords[2]
    local testZ = (coords.z or coords[3]) + 200.0
    local hit, groundZ = GetGroundZFor_3dCoord(baseX, baseY, testZ, true)
    if not hit then
        hit, groundZ = GetGroundZFor_3dCoord(baseX, baseY, testZ, false)
    end
    if not hit then
        return false
    end

    SetEntityRotation(entry.entity, 0.0, 0.0, heading, 2, true)

    local minZ = minDim.z or minDim[3] or 0.0
    local targetZ = groundZ + math.abs(minZ) + 0.01
    SetEntityCoordsNoOffset(entry.entity, baseX, baseY, targetZ, false, false, false)
    SetEntityRotation(
        entry.entity,
        0.0,
        0.0,
        heading,
        2,
        true
    )

    local above = GetEntityHeightAboveGround(entry.entity)
    if above < 0.01 then
        SetEntityCoordsNoOffset(entry.entity, baseX, baseY, targetZ + (0.02 - above), false, false, false)
    end

    updateDraftEntryFromEntity(entry)
    state.draftDirty = true
    syncSelectedObjectToUi(true)
    syncMapElementsToUi()
    syncActiveObjectsToUi()
    return true
end

local function savePedState()
    local ped = PlayerPedId()
    playerStateBackup.valid = true
    playerStateBackup.visible = IsEntityVisible(ped)
end

local function applyEditorPedState(active)
    local ped = PlayerPedId()
    if active then
        savePedState()
        SetEntityVisible(ped, true, false)
        SetEntityCollision(ped, true, true)
        SetEntityInvincible(ped, true)
        ResetEntityAlpha(ped)
        FreezeEntityPosition(ped, true)
        SetEntityVelocity(ped, 0.0, 0.0, 0.0)
    else
        FreezeEntityPosition(ped, false)
        SetEntityVisible(ped, playerStateBackup.visible ~= false, false)
        SetEntityCollision(ped, true, true)
        SetEntityInvincible(ped, false)
        ResetEntityAlpha(ped)
    end
end

local function setEditorMode(mode)
    state.editorMode = mode
    state.textInputFocused = false
    sendUi('cef:forceInputBlur')
    print(('[arderumapbuilder] setEditorMode mode=%s nativeCursor=%s cursorVisible=%s camMove=%s'):format(
        tostring(mode), tostring(state.gizmoCursorNative), tostring(state.cursorVisible), tostring(state.gizmoCameraMove)
    ))
    if state.editorMode == EDITOR_MODE_PANEL then
        disableGizmoCursor()
        destroyExternalCamera()
        state.gizmoCameraMove = false
        state.cursorVisible = true
        applyNuiFocus(true, true, false)
    elseif state.editorMode == EDITOR_MODE_FREECAM then
        disableGizmoCursor()
        ensureExternalCamera()
        state.gizmoCameraMove = true
        if state.externalCam and state.externalCam ~= 0 and DoesCamExist(state.externalCam) then
            SetCamFov(state.externalCam, 58.0)
        end
        state.cursorVisible = false
        applyNuiFocus(false, false, false)
    else
        ensureExternalCamera()
        state.gizmoCameraMove = false
        state.cursorVisible = true
        -- KRITIK: gizmoda NUI focus açılmayacak
        applyNuiFocus(false, false, false)
        enableGizmoCursor()
        focusExternalCameraOnSelection(true)
    end
    applyDraftFreezeState()
    sendUi('cef:setCursorVisible', state.cursorVisible)
    sendUi('cef:setWorldCursor', false, 0.5, 0.5)
    if hasSelectedEntry() then
        syncSelectedObjectToUi(true)
    else
        clearSelectedObjectUi()
    end
    syncEditorModeToUi()
end

local function enterPanelMode()
    setEditorMode(EDITOR_MODE_PANEL)
end

local function enterFreecamMode()
    setEditorMode(EDITOR_MODE_FREECAM)
end

local function enterGizmoMode()
    if not hasSelectedEntry() then
        sendUi('cef:notify', 'error', 'Gizmo icin secili obje gerekli.')
        return
    end

    setEditorMode(EDITOR_MODE_GIZMO)
end

local function movePedFreecam()
    local ped = PlayerPedId()
    local coords = GetEntityCoords(ped)
    local forward = getCameraDirection()
    local right = {
        x = -forward.y,
        y = forward.x,
        z = 0.0
    }

    local speed = isControlPressedSafe(KEY_FAST) and 3.5 or 0.8
    local nextX = coords.x
    local nextY = coords.y
    local nextZ = coords.z

    if isControlPressedSafe(KEY_FORWARD) then
        nextX = nextX + (forward.x * speed)
        nextY = nextY + (forward.y * speed)
        nextZ = nextZ + (forward.z * speed)
    end

    if isControlPressedSafe(KEY_BACK) then
        nextX = nextX - (forward.x * speed)
        nextY = nextY - (forward.y * speed)
        nextZ = nextZ - (forward.z * speed)
    end

    if isControlPressedSafe(KEY_LEFT) then
        nextX = nextX + (right.x * speed)
        nextY = nextY + (right.y * speed)
    end

    if isControlPressedSafe(KEY_RIGHT) then
        nextX = nextX - (right.x * speed)
        nextY = nextY - (right.y * speed)
    end

    if isControlPressedSafe(KEY_UP) then
        nextZ = nextZ + speed
    end

    if isControlPressedSafe(KEY_DOWN) then
        nextZ = nextZ - speed
    end

    SetEntityCoordsNoOffset(ped, nextX, nextY, nextZ, false, false, false)
    SetEntityVelocity(ped, 0.0, 0.0, 0.0)
end

local function normalizeVector(x, y, z)
    local length = math.sqrt((x * x) + (y * y) + (z * z))
    if length <= 0.00001 then
        return 0.0, 0.0, 0.0
    end

    return x / length, y / length, z / length
end

local function makeEntityMatrix(entity)
    local forward, right, up, at = GetEntityMatrix(entity)
    local view = dataview.ArrayBuffer(64)

    view:SetFloat32(0, right.x or right[1])
        :SetFloat32(4, right.y or right[2])
        :SetFloat32(8, right.z or right[3])
        :SetFloat32(12, 0.0)
        :SetFloat32(16, forward.x or forward[1])
        :SetFloat32(20, forward.y or forward[2])
        :SetFloat32(24, forward.z or forward[3])
        :SetFloat32(28, 0.0)
        :SetFloat32(32, up.x or up[1])
        :SetFloat32(36, up.y or up[2])
        :SetFloat32(40, up.z or up[3])
        :SetFloat32(44, 0.0)
        :SetFloat32(48, at.x or at[1])
        :SetFloat32(52, at.y or at[2])
        :SetFloat32(56, at.z or at[3])
        :SetFloat32(60, 1.0)

    return view
end

local function applyEntityMatrix(entity, view)
    local fx, fy, fz = view:GetFloat32(16), view:GetFloat32(20), view:GetFloat32(24)
    local rx, ry, rz = view:GetFloat32(0), view:GetFloat32(4), view:GetFloat32(8)
    local ux, uy, uz = view:GetFloat32(32), view:GetFloat32(36), view:GetFloat32(40)
    local tx, ty, tz = view:GetFloat32(48), view:GetFloat32(52), view:GetFloat32(56)

    local function finite(v)
        return v and v == v and v > -1000000.0 and v < 1000000.0
    end

    if not (finite(fx) and finite(fy) and finite(fz) and finite(rx) and finite(ry) and finite(rz)
        and finite(ux) and finite(uy) and finite(uz) and finite(tx) and finite(ty) and finite(tz)) then
        return false
    end

    local curForward, curRight, curUp, curAt = GetEntityMatrix(entity)
    local curFx = curForward.x or curForward[1] or fx
    local curFy = curForward.y or curForward[2] or fy
    local curFz = curForward.z or curForward[3] or fz
    local curRx = curRight.x or curRight[1] or rx
    local curRy = curRight.y or curRight[2] or ry
    local curRz = curRight.z or curRight[3] or rz
    local curUx = curUp.x or curUp[1] or ux
    local curUy = curUp.y or curUp[2] or uy
    local curUz = curUp.z or curUp[3] or uz
    local curTx = curAt.x or curAt[1] or tx
    local curTy = curAt.y or curAt[2] or ty
    local curTz = curAt.z or curAt[3] or tz

    local lerp = 0.10
    fx = curFx + ((fx - curFx) * lerp)
    fy = curFy + ((fy - curFy) * lerp)
    fz = curFz + ((fz - curFz) * lerp)
    rx = curRx + ((rx - curRx) * lerp)
    ry = curRy + ((ry - curRy) * lerp)
    rz = curRz + ((rz - curRz) * lerp)
    ux = curUx + ((ux - curUx) * lerp)
    uy = curUy + ((uy - curUy) * lerp)
    uz = curUz + ((uz - curUz) * lerp)
    tx = curTx + ((tx - curTx) * lerp)
    ty = curTy + ((ty - curTy) * lerp)
    tz = curTz + ((tz - curTz) * lerp)

    fx, fy, fz = normalizeVector(fx, fy, fz)
    rx, ry, rz = normalizeVector(rx, ry, rz)
    ux, uy, uz = normalizeVector(ux, uy, uz)

    if (fx == 0.0 and fy == 0.0 and fz == 0.0) or (rx == 0.0 and ry == 0.0 and rz == 0.0) or (ux == 0.0 and uy == 0.0 and uz == 0.0) then
        return false
    end

    SetEntityMatrix(entity, fx, fy, fz, rx, ry, rz, ux, uy, uz, tx, ty, tz)
    return true
end

local function getCursorScreenPosition()
    local x = GetDisabledControlNormal(0, 239)
    local y = GetDisabledControlNormal(0, 240)

    if x <= 0.0 or x >= 1.0 then
        x = GetControlNormal(0, 239)
    end
    if y <= 0.0 or y >= 1.0 then
        y = GetControlNormal(0, 240)
    end

    if x <= 0.0 or x >= 1.0 then
        x = 0.5
    end
    if y <= 0.0 or y >= 1.0 then
        y = 0.5
    end

    return x, y
end

local function raycastEntityFromCursor()
    local x, y = getCursorScreenPosition()
    local hasPoint, worldPos, worldDir = GetWorldCoordFromScreenCoord(x, y)
    if not hasPoint then
        return 0
    end

    local fromX = worldPos.x or worldPos[1]
    local fromY = worldPos.y or worldPos[2]
    local fromZ = worldPos.z or worldPos[3]
    local dirX = worldDir.x or worldDir[1]
    local dirY = worldDir.y or worldDir[2]
    local dirZ = worldDir.z or worldDir[3]

    local distance = 2500.0
    local toX = fromX + (dirX * distance)
    local toY = fromY + (dirY * distance)
    local toZ = fromZ + (dirZ * distance)

    local rayHandle = StartShapeTestRay(fromX, fromY, fromZ, toX, toY, toZ, 16, PlayerPedId(), 7)
    local _, hit, _, _, hitEntity = GetShapeTestResult(rayHandle)
    if hit == 1 then
        return hitEntity or 0
    end

    return 0
end

local function processGizmo()
    local selected = getSelectedEntry()
    if not selected or not selected.entity or selected.entity == 0 or not DoesEntityExist(selected.entity) then
        state.selectedDraftId = nil
        clearSelectedObjectUi()
        enterPanelMode()
        return
    end

    state.textInputFocused = false

    if state.gizmoCameraMove then
        if state.gizmoCursorNative then
            disableGizmoCursor()
        end
        updateExternalCameraMovement()
        return
    end

    maintainGizmoCursor()

    DisableControlAction(0, 1, true)
    DisableControlAction(0, 2, true)
    DisableControlAction(1, 1, true)
    DisableControlAction(1, 2, true)
    DisableControlAction(2, 1, true)
    DisableControlAction(2, 2, true)
    DisableControlAction(0, 24, true)
    DisableControlAction(0, 25, true)
    DisableControlAction(0, 140, true)
    DisableControlAction(0, 141, true)
    DisableControlAction(0, 142, true)
    DisableControlAction(0, KEY_FORWARD, true)
    DisableControlAction(0, KEY_BACK, true)
    DisableControlAction(0, KEY_LEFT, true)
    DisableControlAction(0, KEY_RIGHT, true)
    DisableControlAction(0, KEY_UP, true)
    DisableControlAction(0, KEY_DOWN, true)
    DisableControlAction(0, 80, true)
    DisableControlAction(0, 75, true)
    DisablePlayerFiring(PlayerId(), true)
    SetEntityVelocity(PlayerPedId(), 0.0, 0.0, 0.0)

    local matrixBuffer = makeEntityMatrix(selected.entity)
    local changed = Citizen.InvokeNative(0xEB2EDCA2, matrixBuffer:Buffer(), 'Editor1', Citizen.ReturnResultAnyway())
    if changed then
        local applied = applyEntityMatrix(selected.entity, matrixBuffer)
        if applied then
            updateDraftEntryFromEntity(selected)
            state.draftDirty = true
            syncSelectedObjectToUi(false)
            if state.workspaceType == 'map' then
                syncMapElementsToUi()
            else
                syncActiveObjectsToUi()
            end
        end
    end
end

local function teleportToPosition(position)
    if type(position) ~= 'table' then
        return
    end

    local x = Shared.toNumber(position.x, 0.0)
    local y = Shared.toNumber(position.y, 0.0)
    local z = Shared.toNumber(position.z, 0.0)
    SetEntityCoordsNoOffset(PlayerPedId(), x, y, z + 1.0, false, false, false)
end

local function setDraftWorkspace(workspaceType, workspaceName, elements)
    clearDraftObjects()
    state.workspaceType = workspaceType == 'map' and 'map' or 'active'
    state.workspaceName = Shared.sanitizeMapName(workspaceName)

    if state.workspaceType == 'active' then
        state.workspaceName = Shared.ACTIVE_MAP_NAME
        state.selectedMapName = ''
    else
        state.selectedMapName = state.workspaceName
    end

    local source = type(elements) == 'table' and elements or {}
    for index = 1, #source do
        addDraftObject(source[index], false, false)
    end

    state.draftDirty = false
    state.pendingPlacement = nil
    applyDraftFreezeState()

    syncMapElementsToUi()
    syncActiveObjectsToUi()

    if state.workspaceType == 'map' then
        sendUi('cef:onMapLoaded', state.workspaceName, #state.draftObjects, 0)
        sendUi('cef:onMapSelected', state.workspaceName, #state.draftObjects)
    else
        sendUi('cef:onMapSelected', '', 0)
    end
end

local function openEditor(mapsCatalog, customModels, activeObjects)
    if state.editorOpen then
        return
    end

    state.editorOpen = true
    state.worldStreamingPaused = true
    clearWorldEntities()
    clearPreviewObject()

    applyEditorPedState(true)

    state.mapsCatalog = type(mapsCatalog) == 'table' and mapsCatalog or {}
    state.customModels = type(customModels) == 'table' and customModels or {}
    state.serverActiveObjects = type(activeObjects) == 'table' and activeObjects or {}
    state.workspaceType = 'active'
    state.workspaceName = Shared.ACTIVE_MAP_NAME
    state.selectedMapName = ''

    setUiVisible(true)
    setDraftWorkspace('active', Shared.ACTIVE_MAP_NAME, state.serverActiveObjects)
    syncMapsCatalogToUi()
    syncCustomModelsToUi()
    syncActiveObjectsToUi()
    enterPanelMode()

    notifyFeed('~g~Arderu Map Builder acildi.')
end

local function closeEditor(notifyServer)
    if not state.editorOpen then
        return
    end

    state.gizmoCameraMove = false
    disableGizmoCursor()
    applyNuiFocus(false, false, false)
    state.cursorVisible = false
    sendUi('cef:setCursorVisible', false)
    sendUi('cef:setWorldCursor', false, 0.5, 0.5)
    destroyExternalCamera()
    setUiVisible(false)
    sendUi('cef:forceInputBlur')

    clearDraftObjects()
    clearPreviewObject()
    applyEditorPedState(false)

    state.editorOpen = false
    state.cursorVisible = false
    state.textInputFocused = false
    state.workspaceType = 'active'
    state.workspaceName = Shared.ACTIVE_MAP_NAME
    state.selectedMapName = ''
    state.editorMode = EDITOR_MODE_PANEL
    state.selectedDraftId = nil
    state.pendingPlacement = nil
    state.selectedUiNextSyncAt = 0

    state.worldStreamingPaused = false
    TriggerServerEvent(EVENT_SERVER .. ':requestWorldSync')

    if notifyServer then
        TriggerServerEvent(EVENT_SERVER .. ':requestCloseEditor')
    end
end

local function startPlacement(modelName, sourceListType)
    local cleanModel = Shared.normalizeModelName(modelName)
    if cleanModel == '' then
        sendUi('cef:notify', 'error', 'Model adi gecersiz.')
        return
    end

    local ped = PlayerPedId()
    local pedCoords = GetEntityCoords(ped)
    local heading = GetEntityHeading(ped)
    local headingRad = math.rad(heading)
    local forward = {
        x = -math.sin(headingRad),
        y = math.cos(headingRad),
        z = 0.0
    }

    local loadedHash = loadModel(cleanModel, 5000)
    if not loadedHash then
        sendUi('cef:notify', 'error', ('Model yuklenemedi: %s'):format(cleanModel))
        return
    end

    local bounds = getModelBoundsDataFromHash(loadedHash)
    local placeDistance = Shared.clamp((bounds.maxSize * 0.7) + (bounds.radius * 0.9) + 2.0, 3.0, 45.0)
    local entry = {
        id = Shared.makeObjectId('draft'),
        modelName = cleanModel,
        position = {
            x = (pedCoords.x or pedCoords[1]) + (forward.x * placeDistance),
            y = (pedCoords.y or pedCoords[2]) + (forward.y * placeDistance),
            z = (pedCoords.z or pedCoords[3]) + math.max(0.35, bounds.size.z * 0.18)
        },
        rotation = { x = 0.0, y = 0.0, z = heading or 0.0 },
        collision = true,
        visible = true
    }

    local created = addDraftObject(entry, true, true)
    if not created then
        SetModelAsNoLongerNeeded(loadedHash)
        sendUi('cef:notify', 'error', ('Model yuklenemedi: %s'):format(cleanModel))
        return
    end

    SetModelAsNoLongerNeeded(loadedHash)
    state.pendingPlacement = {
        id = created.id,
        modelName = cleanModel,
        sourceListType = sourceListType or 'objects'
    }
    state.sourceListType = sourceListType or 'objects'

    syncMapElementsToUi()
    syncActiveObjectsToUi()
    enterGizmoMode()
    sendUi('cef:notify', 'success', ('Obje yerlestirildi: %s'):format(cleanModel))
end

local function confirmPlacement()
    if not state.pendingPlacement then
        return
    end
    state.pendingPlacement = nil
    focusExternalCameraOnSelection(true)
    sendUi('cef:notify', 'success', 'Obje yerlestirme tamamlandi.')
end

local function cancelPlacement()
    if not state.pendingPlacement then
        return
    end

    local canceled = Shared.deepCopy(state.pendingPlacement)
    removeDraftObjectById(canceled.id, true)
    state.pendingPlacement = nil
    syncMapElementsToUi()
    syncActiveObjectsToUi()
    syncSelectedObjectToUi(true)
    sendUi('cef:reopenPlacementSelection', canceled.sourceListType or 'objects', canceled.modelName or '')
    enterPanelMode()
end

local function applySelectedObjectEdits(payload)
    local entry = getSelectedEntry()
    if not entry or not DoesEntityExist(entry.entity) then
        return
    end

    local parsed = decodeJson(payload, {})
    if type(parsed) ~= 'table' then
        return
    end

    local position = parsed.position or {}
    local rotation = parsed.rotation or {}
    local nextCollision = parsed.collision ~= false

    SetEntityCoordsNoOffset(
        entry.entity,
        Shared.toNumber(position.x, entry.position.x),
        Shared.toNumber(position.y, entry.position.y),
        Shared.toNumber(position.z, entry.position.z),
        false,
        false,
        false
    )

    SetEntityRotation(
        entry.entity,
        Shared.toNumber(rotation.x, entry.rotation.x),
        Shared.toNumber(rotation.y, entry.rotation.y),
        Shared.toNumber(rotation.z, entry.rotation.z),
        2,
        true
    )

    SetEntityCollision(entry.entity, nextCollision, nextCollision)
    entry.collision = nextCollision
    updateDraftEntryFromEntity(entry)
    state.draftDirty = true

    syncSelectedObjectToUi(true)
    syncMapElementsToUi()
    syncActiveObjectsToUi()
end

local function setSelectedCollision(isEnabled)
    local entry = getSelectedEntry()
    if not entry or not DoesEntityExist(entry.entity) then
        return
    end

    local nextValue = isEnabled == true
    SetEntityCollision(entry.entity, nextValue, nextValue)
    entry.collision = nextValue
    state.draftDirty = true

    syncSelectedObjectToUi(true)
end

local function deleteSelectedObject()
    local entry = getSelectedEntry()
    if not entry then
        return
    end

    removeDraftObjectById(entry.id, true)
    if state.pendingPlacement and state.pendingPlacement.id == entry.id then
        state.pendingPlacement = nil
    end

    syncMapElementsToUi()
    syncActiveObjectsToUi()
    syncEditorModeToUi()
    sendUi('cef:notify', 'info', 'Secili obje silindi.')
end

local function requestSave(workspaceMapName)
    local elements = collectDraftElements()

    if state.workspaceType == 'map' then
        local cleanName = Shared.sanitizeMapName(workspaceMapName)
        if cleanName ~= '' then
            state.workspaceName = cleanName
            state.selectedMapName = cleanName
        end

        if state.workspaceName == '' then
            sendUi('cef:showNewMapNameDialog')
            return
        end

        TriggerServerEvent(EVENT_SERVER .. ':saveWorkspace', 'map', state.workspaceName, elements)
    else
        TriggerServerEvent(EVENT_SERVER .. ':saveWorkspace', 'active', Shared.ACTIVE_MAP_NAME, elements)
    end
end

local function requestNewMap(ignoreUnsaved, mapName)
    local cleanName = Shared.sanitizeMapName(mapName)
    if cleanName == '' then
        sendUi('cef:showNewMapNameDialog')
        return
    end

    for index = 1, #state.mapsCatalog do
        local row = state.mapsCatalog[index]
        if row and row.name == cleanName then
            sendUi('cef:notify', 'error', 'Bu isimde bir harita zaten var.')
            return
        end
    end

    if state.draftDirty and ignoreUnsaved ~= true then
        sendUi('cef:showNewMapIgnoreUnsavedDialog', cleanName)
        return
    end

    setDraftWorkspace('map', cleanName, {})
    sendUi('cef:notify', 'success', ('Yeni harita: %s'):format(cleanName))
end

local function teleportToMap(mapName)
    local cleanName = Shared.sanitizeMapName(mapName)
    if cleanName == '' then
        return
    end

    for index = 1, #state.mapsCatalog do
        local row = state.mapsCatalog[index]
        if row and row.name == cleanName and row.firstPosition then
            teleportToPosition(row.firstPosition)
            return
        end
    end
end

local function focusDraftObject(draftId)
    local cleanId = Shared.sanitizeKey(draftId, 96)
    if cleanId == '' then
        return
    end

    local entry = state.draftById[cleanId]
    if not entry then
        return
    end

    setSelectedDraftById(entry.id, true)
    updateDraftEntryFromEntity(entry)

    local focus = getEntityFocusData(entry.entity)
    local travelDistance = 3.0
    local heightOffset = 1.2
    if focus then
        travelDistance = Shared.clamp((focus.radius * 1.25) + (focus.maxSize * 0.45) + 2.0, 4.0, 55.0)
        heightOffset = math.max(1.2, focus.size.z * 0.25)
    end

    local targetPos = entry.position
    local camDir = getCameraDirection()
    SetEntityCoordsNoOffset(
        PlayerPedId(),
        targetPos.x - (camDir.x * travelDistance),
        targetPos.y - (camDir.y * travelDistance),
        targetPos.z + heightOffset,
        false,
        false,
        false
    )
    focusExternalCameraOnSelection(true)
end

local nuiHandlers = {}

local function registerNuiHandler(name, cb)
    nuiHandlers[name] = cb
end

registerNuiHandler('client:builder:editorStarted', function()
    if state.editorOpen then
        return
    end

    state.cursorVisible = false
    state.textInputFocused = false
    state.gizmoCameraMove = false
    disableGizmoCursor()
    destroyExternalCamera()
    applyNuiFocus(false, false, false)
    setUiVisible(false)
    sendUi('cef:forceInputBlur')
    sendUi('cef:setCursorVisible', false)
    sendUi('cef:setWorldCursor', false, 0.5, 0.5)
end)

registerNuiHandler('client:builder:textInputFocus', function(focused)
    state.textInputFocused = focused == true
end)

registerNuiHandler('client:builder:cursorUpdate', function(_payload)
end)

registerNuiHandler('client:builder:pointerDown', function(_payload)
end)

registerNuiHandler('client:builder:pointerUp', function(_payload)
end)

registerNuiHandler('client:objectPreview', function(modelName)
    clearPreviewObject()
    local cleanModel = Shared.normalizeModelName(modelName)
    if cleanModel == '' or not state.editorOpen then
        return
    end

    local heading = GetEntityHeading(PlayerPedId()) or 0.0
    local bounds = getModelBoundsDataFromHash(GetHashKey(cleanModel))
    local radius = bounds.radius
    local previewFov = 30.0

    local baseX = -2500.0
    local baseY = -2500.0
    local baseZ = 1200.0 + math.max(60.0, radius * 4.0)

    local previewEntry = {
        modelName = cleanModel,
        position = {
            x = baseX,
            y = baseY,
            z = baseZ
        },
        rotation = { x = 0.0, y = 0.0, z = heading },
        collision = false
    }
    previewState.entity = spawnObjectAt(previewEntry, false)
    if previewState.entity ~= 0 then
        SetEntityCollision(previewState.entity, false, false)
        FreezeEntityPosition(previewState.entity, true)
        SetEntityVisible(previewState.entity, true, false)
        SetEntityAlpha(previewState.entity, 255, false)
        SetEntityLodDist(previewState.entity, 0x7FFF)
        SetFocusPosAndVel(baseX, baseY, baseZ, 0.0, 0.0, 0.0)
        previewState.focusActive = true

        ensureExternalCamera()
        if state.externalCam and state.externalCam ~= 0 and DoesCamExist(state.externalCam) then
            frameCameraOnEntity(state.externalCam, previewState.entity, {
                fov = previewFov,
                pitch = -10.0,
                heading = heading + 35.0,
                distanceMultiplier = 1.15,
                distanceOffset = 0.8
            })
        end
    end
end)

registerNuiHandler('client:exitPreview', function()
    clearPreviewObject()
    if state.editorMode == EDITOR_MODE_PANEL then
        destroyExternalCamera()
    end
end)

registerNuiHandler('client:objectSelected', function(modelName, sourceListType)
    clearPreviewObject()
    startPlacement(modelName, sourceListType)
end)

registerNuiHandler('client:gotoMap', function(mapName)
    teleportToMap(mapName)
end)

registerNuiHandler('client:requestMapOpen', function(mapName)
    TriggerServerEvent(EVENT_SERVER .. ':requestWorkspaceData', 'map', mapName)
end)

registerNuiHandler('client:requestMapDelete', function(mapName)
    TriggerServerEvent(EVENT_SERVER .. ':deleteMap', mapName)
end)

registerNuiHandler('client:toggleMapVisibility', function(mapName, visible)
    TriggerServerEvent(EVENT_SERVER .. ':toggleMapVisibility', mapName, visible == true)
end)

registerNuiHandler('client:gotoBuilderObject', function(payload)
    local parsed = decodeJson(payload, {})
    if parsed and parsed.position then
        teleportToPosition(parsed.position)
    end
end)

registerNuiHandler('client:deleteActiveObject', function(objectId)
    local cleanId = Shared.sanitizeKey(objectId, 96)
    if cleanId == '' then
        return
    end

    if state.workspaceType == 'active' and state.draftById[cleanId] then
        removeDraftObjectById(cleanId, true)
        syncActiveObjectsToUi()
        return
    end

    TriggerServerEvent(EVENT_SERVER .. ':deleteActiveObject', cleanId)
end)

registerNuiHandler('client:confirmObjectDelete', function()
    deleteSelectedObject()
end)

registerNuiHandler('client:requestMapRename', function(oldName, newName)
    TriggerServerEvent(EVENT_SERVER .. ':renameMap', oldName, newName)
end)

registerNuiHandler('client:requestNewMap', function(ignoreUnsaved, mapName)
    requestNewMap(ignoreUnsaved == true, mapName)
end)

registerNuiHandler('client:requestMapSave', function(mapName)
    requestSave(mapName)
end)

registerNuiHandler('client:requestAddCustomModel', function(modelName)
    TriggerServerEvent(EVENT_SERVER .. ':addCustomModel', modelName)
end)

registerNuiHandler('client:requestExit', function()
    closeEditor(true)
end)

registerNuiHandler('client:objectEdit:apply', function(payload)
    applySelectedObjectEdits(payload)
end)

registerNuiHandler('client:objectEdit:setCollision', function(enabled)
    setSelectedCollision(enabled == true)
end)

registerNuiHandler('client:elementFocus', function(draftId)
    focusDraftObject(draftId)
end)

RegisterNUICallback('invoke', function(data, cb)
    local response = { ok = true }
    local name = data and data.name or ''
    local args = data and data.args or {}
    local handler = nuiHandlers[name]

    if handler then
        local ok, err = pcall(function()
            handler(table.unpack(type(args) == 'table' and args or {}))
        end)
        if not ok then
            response.ok = false
            response.error = tostring(err)
            print(('[%s] NUI handler failed for %s: %s'):format(Shared.RESOURCE_NAME, tostring(name), tostring(err)))
        end
    end

    cb(response)
end)

local function setWorldObjects(rawWorldList, revision)
    state.worldRevision = Shared.toNumber(revision, 0)
    state.worldObjects = {}
    state.worldById = {}

    local source = type(rawWorldList) == 'table' and rawWorldList or {}
    for index = 1, #source do
        local row = source[index]
        if type(row) == 'table' then
            local clean = Shared.validateObject({
                id = row.id,
                modelName = row.modelName,
                position = row.position,
                rotation = row.rotation,
                collision = row.collision ~= false,
                visible = true
            }, row.id)

            if clean and clean.id ~= '' then
                state.worldObjects[#state.worldObjects + 1] = clean
                state.worldById[clean.id] = clean
            end
        end
    end

    for objectId, entity in pairs(state.worldEntities) do
        if not state.worldById[objectId] then
            deleteEntitySafe(entity)
            state.worldEntities[objectId] = nil
        end
    end
end

RegisterNetEvent(EVENT_CLIENT .. ':openEditor', function(mapsCatalog, customModels, activeObjects)
    openEditor(mapsCatalog, customModels, activeObjects)
end)

RegisterNetEvent(EVENT_CLIENT .. ':statePush', function(mapsCatalog, customModels, activeObjects)
    state.mapsCatalog = type(mapsCatalog) == 'table' and mapsCatalog or {}
    state.customModels = type(customModels) == 'table' and customModels or {}
    state.serverActiveObjects = type(activeObjects) == 'table' and activeObjects or {}

    syncMapsCatalogToUi()
    syncCustomModelsToUi()
    syncActiveObjectsToUi()
end)

RegisterNetEvent(EVENT_CLIENT .. ':workspaceData', function(workspaceType, workspaceName, elements, _visible)
    local cleanType = tostring(workspaceType or 'active') == 'map' and 'map' or 'active'
    setDraftWorkspace(cleanType, workspaceName or '', type(elements) == 'table' and elements or {})
    setSelectedDraftById(nil, true)
    enterPanelMode()
end)

RegisterNetEvent(EVENT_CLIENT .. ':worldSync', function(worldList, revision)
    setWorldObjects(worldList, revision)
end)

RegisterNetEvent(EVENT_CLIENT .. ':notify', function(notifyType, message)
    sendUi('cef:notify', notifyType or 'info', message or '')
    if message and message ~= '' then
        notifyFeed('~w~' .. tostring(message))
    end
end)

RegisterNetEvent(EVENT_CLIENT .. ':mapDeleted', function(mapName)
    local cleanName = Shared.sanitizeMapName(mapName)
    sendUi('cef:onMapDeleted', cleanName)

    if state.workspaceType == 'map' and state.workspaceName == cleanName then
        setDraftWorkspace('active', Shared.ACTIVE_MAP_NAME, state.serverActiveObjects)
        enterPanelMode()
    end
end)

RegisterNetEvent(EVENT_CLIENT .. ':mapRenamed', function(oldName, newName)
    local cleanOld = Shared.sanitizeMapName(oldName)
    local cleanNew = Shared.sanitizeMapName(newName)

    if state.workspaceType == 'map' and state.workspaceName == cleanOld then
        state.workspaceName = cleanNew
        state.selectedMapName = cleanNew
    end
end)

RegisterNetEvent(EVENT_CLIENT .. ':activeObjectDeleted', function(objectId, updatedActiveObjects)
    local cleanId = Shared.sanitizeKey(objectId, 96)
    if state.workspaceType == 'active' then
        removeDraftObjectById(cleanId, false)
    end

    state.serverActiveObjects = type(updatedActiveObjects) == 'table' and updatedActiveObjects or {}
    syncActiveObjectsToUi()
    sendUi('cef:onActiveObjectsDeleted', cleanId, encodeJson(buildActiveUiList(), '[]'))
end)

RegisterCommand('arderumapbuilder_open', function()
    if state.editorOpen then
        closeEditor(true)
        return
    end
    TriggerServerEvent(EVENT_SERVER .. ':requestOpenEditor')
end, false)

RegisterCommand('mapbuilder', function()
    ExecuteCommand('arderumapbuilder_open')
end, false)

RegisterCommand('builder', function()
    ExecuteCommand('arderumapbuilder_open')
end, false)

RegisterKeyMapping('arderumapbuilder_open', 'Open Arderu Map Builder', 'keyboard', 'F10')

RegisterKeyMapping('+gizmoSelect', 'Object Gizmo Select', 'MOUSE_BUTTON', 'MOUSE_LEFT')
RegisterKeyMapping('+gizmoTranslation', 'Object Gizmo Translate', 'keyboard', 'W')
RegisterKeyMapping('+gizmoRotation', 'Object Gizmo Rotate', 'keyboard', 'R')
RegisterKeyMapping('+gizmoLocal', 'Object Gizmo Toggle Local', 'keyboard', 'Q')

CreateThread(function()
    Wait(1200)
    TriggerServerEvent(EVENT_SERVER .. ':requestWorldSync')
end)

CreateThread(function()
    while true do
        Wait(700)

        if state.worldStreamingPaused or state.editorOpen then
            if next(state.worldEntities) then
                clearWorldEntities()
            end
        else
            local ped = PlayerPedId()
            local pedCoords = GetEntityCoords(ped)
            local spawnBudget = 8
            local nearSet = {}

            for index = 1, #state.worldObjects do
                local row = state.worldObjects[index]
                if row then
                    local distSq = distanceSquared(row.position, pedCoords)
                    local shouldExist = distSq <= (Shared.STREAM_RADIUS * Shared.STREAM_RADIUS)
                    local entity = state.worldEntities[row.id]

                    if shouldExist then
                        nearSet[row.id] = true
                        if (not entity or entity == 0 or not DoesEntityExist(entity)) and spawnBudget > 0 then
                            local created = spawnObjectAt(row, true)
                            if created ~= 0 then
                                state.worldEntities[row.id] = created
                            end
                            spawnBudget = spawnBudget - 1
                        end
                    elseif entity and DoesEntityExist(entity) and distSq > (Shared.STREAM_DESPAWN_RADIUS * Shared.STREAM_DESPAWN_RADIUS) then
                        deleteEntitySafe(entity)
                        state.worldEntities[row.id] = nil
                    end
                end
            end

            for objectId, entity in pairs(state.worldEntities) do
                if not state.worldById[objectId] or not nearSet[objectId] then
                    local row = state.worldById[objectId]
                    if not row or distanceSquared(row.position, pedCoords) > (Shared.STREAM_DESPAWN_RADIUS * Shared.STREAM_DESPAWN_RADIUS) then
                        deleteEntitySafe(entity)
                        state.worldEntities[objectId] = nil
                    end
                end
            end
        end
    end
end)

CreateThread(function()
    while true do
        Wait(0)

        if not state.editorOpen then
            if state.gizmoCursorNative or state.cursorVisible then
                applyFreecamInputOwnership()
            else
                applyNuiFocus(false, false, false)
            end
            if state.externalCam and state.externalCam ~= 0 then
                destroyExternalCamera()
            end
            state.textInputFocused = false
            state.gizmoDragging = false
            Wait(50)
        else
            HideHudAndRadarThisFrame()
            DisplayRadar(false)
            DisablePlayerFiring(PlayerId(), true)

            if previewState.entity ~= 0 and DoesEntityExist(previewState.entity) then
                local h = GetEntityHeading(previewState.entity)
                SetEntityHeading(previewState.entity, (h + 0.35) % 360.0)
            end

            if state.editorMode == EDITOR_MODE_PANEL then
                applyNuiFocus(true, true, false)
            end

            if state.editorMode ~= EDITOR_MODE_GIZMO and state.gizmoCursorNative then
                disableGizmoCursor()
            end

            if GetGameTimer() - state.lastIdleCamInvalidate > 500 then
                InvalidateIdleCam()
                InvalidateVehicleIdleCam()
                state.lastIdleCamInvalidate = GetGameTimer()
            end

            for index = 1, #HIDDEN_HUD_COMPONENTS do
                HideHudComponentThisFrame(HIDDEN_HUD_COMPONENTS[index])
            end

            for index = 1, #BLOCKED_CONTROLS do
                DisableControlAction(0, BLOCKED_CONTROLS[index], true)
            end

            if state.editorMode == EDITOR_MODE_PANEL then
                DisableControlAction(0, KEY_FORWARD, true)
                DisableControlAction(0, KEY_BACK, true)
                DisableControlAction(0, KEY_LEFT, true)
                DisableControlAction(0, KEY_RIGHT, true)
                DisableControlAction(0, KEY_UP, true)
                DisableControlAction(0, KEY_DOWN, true)
                DisableControlAction(0, 1, true)
                DisableControlAction(0, 2, true)
                DisableControlAction(1, 1, true)
                DisableControlAction(1, 2, true)
                DisableControlAction(2, 1, true)
                DisableControlAction(2, 2, true)
            elseif state.editorMode == EDITOR_MODE_FREECAM then
                updateExternalCameraMovement()
            else
                processGizmo()
            end

            if state.editorMode == EDITOR_MODE_GIZMO then
                state.textInputFocused = false
            end

            if state.editorMode == EDITOR_MODE_PANEL and state.textInputFocused then
                goto continue_tick
            end

            if isControlJustPressedSafe(KEY_F2) then
                if state.editorMode == EDITOR_MODE_PANEL then
                    if hasSelectedEntry() then
                        enterGizmoMode()
                        sendUi('cef:notify', 'info', 'Gizmo moda gecildi.')
                    else
                        sendUi('cef:notify', 'error', 'Once bir obje sec.')
                    end
                elseif state.editorMode == EDITOR_MODE_GIZMO then
                    state.gizmoCameraMove = not state.gizmoCameraMove
                    if state.gizmoCameraMove then
                        state.gizmoDragging = false
                        applyFreecamInputOwnership()
                        if state.externalCam and state.externalCam ~= 0 and DoesCamExist(state.externalCam) then
                            SetCamFov(state.externalCam, 58.0)
                        end
                        sendUi('cef:setCursorVisible', false)
                        sendUi('cef:notify', 'info', 'Harici kamera kontrolu acildi.')
                    else
                        applyGizmoInputOwnership()
                        if state.externalCam and state.externalCam ~= 0 and DoesCamExist(state.externalCam) then
                            SetCamFov(state.externalCam, 26.0)
                        end
                        sendUi('cef:setCursorVisible', true)
                        focusExternalCameraOnSelection(true)
                        sendUi('cef:notify', 'info', 'Gizmo kontrolune donuldu.')
                    end
                else
                    enterGizmoMode()
                end
            end

            if isControlJustPressedSafe(KEY_ESCAPE) then
                if state.pendingPlacement then
                    cancelPlacement()
                elseif state.editorMode == EDITOR_MODE_PANEL then
                    sendUi('cef:builderHandleEscape')
                elseif state.editorMode == EDITOR_MODE_GIZMO then
                    if state.gizmoCameraMove then
                        state.gizmoCameraMove = false
                        applyGizmoInputOwnership()
                        if state.externalCam and state.externalCam ~= 0 and DoesCamExist(state.externalCam) then
                            SetCamFov(state.externalCam, 26.0)
                        end
                        sendUi('cef:setCursorVisible', true)
                        focusExternalCameraOnSelection(true)
                        sendUi('cef:notify', 'info', 'Kamera kontrolu kapandi.')
                    else
                        sendUi('cef:notify', 'info', 'Panele donmek icin Enter kullan.')
                    end
                else
                    enterGizmoMode()
                end
            end

            if isControlJustPressedSafe(KEY_ENTER) then
                if state.editorMode == EDITOR_MODE_GIZMO and hasSelectedEntry() then
                    confirmPlacement()
                    enterPanelMode()
                    sendUi('cef:notify', 'success', 'Panele donuldu.')
                else
                    confirmPlacement()
                end
            end

            if isControlJustPressedSafe(KEY_BACKSPACE) and state.pendingPlacement then
                cancelPlacement()
            end

            if isControlJustPressedSafe(KEY_DELETE) and hasSelectedEntry() then
                deleteSelectedObject()
                syncMapElementsToUi()
                syncActiveObjectsToUi()
            end

            if state.editorMode ~= EDITOR_MODE_PANEL and hasSelectedEntry() and isControlJustPressedSafe(KEY_CLONE) then
                cloneSelectedObject()
            end

            if state.editorMode ~= EDITOR_MODE_PANEL and hasSelectedEntry() and isControlJustPressedSafe(KEY_SNAP_TO_GROUND) then
                if snapSelectedToGround() then
                    sendUi('cef:notify', 'success', 'Obje zemine yapistirildi.')
                end
            end
        end

        ::continue_tick::
    end
end)

local function forceUiCursorOff()
    state.editorOpen = false
    state.textInputFocused = false
    state.gizmoCameraMove = false
    state.gizmoDragging = false
    applyFreecamInputOwnership()
    destroyExternalCamera()
    clearPreviewObject()
    setUiVisible(false)
    sendUi('cef:forceInputBlur')
    sendUi('cef:setCursorVisible', false)
    sendUi('cef:setWorldCursor', false, 0.5, 0.5)
end

AddEventHandler('onClientResourceStart', function(resourceName)
    if resourceName ~= GetCurrentResourceName() then
        return
    end

    forceUiCursorOff()
end)

AddEventHandler('playerSpawned', function()
    if not state.editorOpen then
        forceUiCursorOff()
    end
end)

CreateThread(function()
    while true do
        Wait(0)
        if not state.editorOpen then
            applyNuiFocus(false, false, false)
            pcall(function()
                LeaveCursorMode()
            end)
        else
            Wait(120)
        end
    end
end)

AddEventHandler('onResourceStop', function(resourceName)
    if resourceName ~= GetCurrentResourceName() then
        return
    end

    closeEditor(false)
    clearWorldEntities()
end)
