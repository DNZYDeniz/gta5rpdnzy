local dataView = setmetatable({
    EndBig = ">",
    EndLittle = "<",
    Types = {
        Float32 = { code = "f", size = 4 },
    },
}, {
    __call = function(_, length)
        return dataView.ArrayBuffer(length)
    end
})

dataView.__index = dataView

function dataView.ArrayBuffer(length)
    return setmetatable({
        blob = string.blob(length),
        length = length,
        offset = 1,
        cangrow = true,
    }, dataView)
end

function dataView:Buffer()
    return self.blob
end

local function ef(big)
    return (big and dataView.EndBig) or dataView.EndLittle
end

local function packblob(self, offset, value, code)
    local packed = self.blob:blob_pack(offset, code, value)
    if self.cangrow or packed == self.blob then
        self.blob = packed
        self.length = packed:len()
        return true
    end
    return false
end

for label, datatype in pairs(dataView.Types) do
    dataView["Get" .. label] = function(self, offset, endian)
        offset = offset or 0
        if offset >= 0 then
            local value = self.blob:blob_unpack(self.offset + offset, ef(endian) .. datatype.code)
            return value
        end
        return nil
    end

    dataView["Set" .. label] = function(self, offset, value, endian)
        if offset >= 0 and value then
            local code = ef(endian) .. datatype.code
            if not packblob(self, self.offset + offset, value, code) then
                error("cannot grow dataview")
            end
        end
        return self
    end
end

return dataView
