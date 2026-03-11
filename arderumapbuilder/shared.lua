BuilderShared = BuilderShared or {}
local Shared = BuilderShared
local idCounter = 0

Shared.RESOURCE_NAME = 'arderumapbuilder'
Shared.EVENT_SERVER = Shared.RESOURCE_NAME .. ':server'
Shared.EVENT_CLIENT = Shared.RESOURCE_NAME .. ':client'

Shared.ACTIVE_MAP_NAME = '__active_objects'
Shared.MAX_MAP_ELEMENTS = 5000
Shared.MAX_MAP_SIZE_BYTES = 2 * 1024 * 1024
Shared.MAX_MODEL_NAME_LENGTH = 80
Shared.MAX_MAP_NAME_LENGTH = 64
Shared.STREAM_RADIUS = 350.0
Shared.STREAM_DESPAWN_RADIUS = 390.0

local function trim(value)
    local text = tostring(value or '')
    return text:match('^%s*(.-)%s*$') or ''
end

function Shared.sanitizeMapName(rawName)
    local text = trim(rawName)
    text = text:gsub('[^%w_%-]', '_'):gsub('_+', '_')
    return text:sub(1, Shared.MAX_MAP_NAME_LENGTH)
end

function Shared.sanitizeKey(rawValue, maxLength)
    local text = trim(rawValue)
    text = text:gsub('[^%w_%-]', '_'):gsub('_+', '_')
    return text:sub(1, maxLength or 96)
end

function Shared.normalizeModelName(rawName)
    local text = trim(rawName):lower()
    text = text:gsub('%.ydr$', ''):gsub('%.ytyp$', ''):gsub('%.rpf$', '')
    text = text:gsub('[^%w_%-]', '')
    return text:sub(1, Shared.MAX_MODEL_NAME_LENGTH)
end

function Shared.toNumber(value, fallback)
    local parsed = tonumber(value)
    if parsed == nil or parsed ~= parsed then
        return fallback or 0.0
    end

    return parsed
end

function Shared.clamp(value, minimum, maximum)
    local number = Shared.toNumber(value, minimum)
    if number < minimum then
        return minimum
    end

    if number > maximum then
        return maximum
    end

    return number
end

local function toVectorObject(value, fallback)
    if type(value) ~= 'table' then
        return fallback
    end

    local x = Shared.toNumber(value.x, nil)
    local y = Shared.toNumber(value.y, nil)
    local z = Shared.toNumber(value.z, nil)
    if not x or not y or not z then
        return fallback
    end

    return { x = x, y = y, z = z }
end

function Shared.makeObjectId(prefix)
    local p = Shared.sanitizeKey(prefix or 'obj', 24)
    local tick = 0
    if type(GetGameTimer) == 'function' then
        tick = GetGameTimer()
    end
    idCounter = idCounter + 1
    local randomPart = math.random(100000, 999999)
    return ('%s_%d_%d_%d'):format(p, tick, idCounter, randomPart)
end

function Shared.deepCopy(value)
    if type(value) ~= 'table' then
        return value
    end

    local out = {}
    for key, row in pairs(value) do
        out[key] = Shared.deepCopy(row)
    end
    return out
end

local function isWithinWorldBounds(position)
    if not position then
        return false
    end

    if math.abs(position.x) > 10000.0 then
        return false
    end

    if math.abs(position.y) > 10000.0 then
        return false
    end

    if position.z < -2500.0 or position.z > 6000.0 then
        return false
    end

    return true
end

function Shared.validateObject(rawObject, fallbackId)
    if type(rawObject) ~= 'table' then
        return nil, 'invalid_payload'
    end

    local modelName = Shared.normalizeModelName(rawObject.modelName)
    if modelName == '' then
        return nil, 'invalid_model'
    end

    local position = toVectorObject(rawObject.position, nil)
    if not position or not isWithinWorldBounds(position) then
        return nil, 'invalid_position'
    end

    local rotation = toVectorObject(rawObject.rotation, { x = 0.0, y = 0.0, z = 0.0 })
    local objectId = Shared.sanitizeKey(rawObject.id or fallbackId or Shared.makeObjectId('obj'), 96)
    if objectId == '' then
        objectId = Shared.makeObjectId('obj')
    end

    return {
        id = objectId,
        modelName = modelName,
        type = 'object',
        position = {
            x = Shared.toNumber(position.x, 0.0),
            y = Shared.toNumber(position.y, 0.0),
            z = Shared.toNumber(position.z, 0.0)
        },
        rotation = {
            x = Shared.toNumber(rotation.x, 0.0),
            y = Shared.toNumber(rotation.y, 0.0),
            z = Shared.toNumber(rotation.z, 0.0)
        },
        scale = 1,
        collision = rawObject.collision ~= false,
        visible = rawObject.visible ~= false
    }, nil
end

function Shared.normalizeElements(rawElements)
    local source = type(rawElements) == 'table' and rawElements or {}
    local out = {}
    local idSet = {}

    for index = 1, math.min(#source, Shared.MAX_MAP_ELEMENTS) do
        local entry, reason = Shared.validateObject(source[index], ('obj_%d'):format(index))
        if entry and not idSet[entry.id] then
            idSet[entry.id] = true
            out[#out + 1] = entry
        else
            if reason == 'invalid_model' then
                -- keep normalize pass deterministic: invalid rows are simply skipped
            end
        end
    end

    return out
end

function Shared.isMapNameValid(rawName)
    return Shared.sanitizeMapName(rawName) ~= ''
end

local timerSeed = 0
if type(GetGameTimer) == 'function' then
    timerSeed = GetGameTimer()
end

math.randomseed(timerSeed + 71337)
