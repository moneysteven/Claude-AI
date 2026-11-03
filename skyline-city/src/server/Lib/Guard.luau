-- Guard: validation helpers for anything that arrives from a client.
-- NEVER trust client values. Every Guard function returns the cleaned value or nil.

local Guard = {}

local function finite(n: number): boolean
	return n == n and n ~= math.huge and n ~= -math.huge
end

-- Integer in [min, max]
function Guard.Int(v: any, min: number, max: number): number?
	if type(v) ~= "number" or not finite(v) then
		return nil
	end
	if v ~= math.floor(v) then
		return nil
	end
	if v < min or v > max then
		return nil
	end
	return v
end

-- Positive money amount (integer dollars) in [1, max]
function Guard.Money(v: any, max: number): number?
	return Guard.Int(v, 1, max)
end

function Guard.Number(v: any, min: number, max: number): number?
	if type(v) ~= "number" or not finite(v) then
		return nil
	end
	if v < min or v > max then
		return nil
	end
	return v
end

function Guard.Bool(v: any): boolean?
	if type(v) ~= "boolean" then
		return nil
	end
	return v
end

-- String with length limit (bytes). Control characters are stripped.
function Guard.String(v: any, maxLen: number): string?
	if type(v) ~= "string" then
		return nil
	end
	if #v > maxLen then
		return nil
	end
	if not utf8.len(v) then
		return nil
	end
	local cleaned = v:gsub("[%c]", "")
	return cleaned
end

-- Identifier: letters, digits, underscore, dash. No dots (data paths use dots).
function Guard.Id(v: any, maxLen: number?): string?
	if type(v) ~= "string" then
		return nil
	end
	if #v == 0 or #v > (maxLen or 64) then
		return nil
	end
	if v:find("[^%w_%-]") then
		return nil
	end
	return v
end

-- Value must be a key of `set`.
function Guard.OneOf(v: any, set: { [any]: any }): any?
	if v == nil or set[v] == nil then
		return nil
	end
	return v
end

-- Color from client: either Color3 or {R,G,B} 0-255. Returns {R,G,B} integers.
function Guard.Color(v: any): { number }?
	if typeof(v) == "Color3" then
		return { math.floor(v.R * 255 + 0.5), math.floor(v.G * 255 + 0.5), math.floor(v.B * 255 + 0.5) }
	end
	if type(v) == "table" then
		local r, g, b = Guard.Int(v[1], 0, 255), Guard.Int(v[2], 0, 255), Guard.Int(v[3], 0, 255)
		if r and g and b then
			return { r, g, b }
		end
	end
	return nil
end

function Guard.Vector3(v: any, maxMagnitude: number?): Vector3?
	if typeof(v) ~= "Vector3" then
		return nil
	end
	if not (finite(v.X) and finite(v.Y) and finite(v.Z)) then
		return nil
	end
	if maxMagnitude and v.Magnitude > maxMagnitude then
		return nil
	end
	return v
end

function Guard.CFrame(v: any): CFrame?
	if typeof(v) ~= "CFrame" then
		return nil
	end
	local p = v.Position
	if not (finite(p.X) and finite(p.Y) and finite(p.Z)) then
		return nil
	end
	return v
end

-- Character root position (or nil if no character).
function Guard.RootPosition(player: Player): Vector3?
	local char = player.Character
	local root = char and char:FindFirstChild("HumanoidRootPart")
	if root and root:IsA("BasePart") then
		return root.Position
	end
	return nil
end

-- Is the player within `maxDist` studs of `target` (Vector3, BasePart or Model)?
function Guard.Near(player: Player, target: any, maxDist: number): boolean
	local pos = Guard.RootPosition(player)
	if not pos then
		return false
	end
	local targetPos: Vector3
	if typeof(target) == "Vector3" then
		targetPos = target
	elseif typeof(target) == "Instance" then
		if target:IsA("BasePart") then
			targetPos = target.Position
		elseif target:IsA("Model") then
			targetPos = target:GetPivot().Position
		else
			return false
		end
	else
		return false
	end
	return (pos - targetPos).Magnitude <= maxDist
end

-- Is the player near ANY instance with this CollectionService tag?
function Guard.NearTagged(player: Player, tag: string, maxDist: number): Instance?
	local CollectionService = game:GetService("CollectionService")
	for _, inst in ipairs(CollectionService:GetTagged(tag)) do
		if Guard.Near(player, inst, maxDist) then
			return inst
		end
	end
	return nil
end

return Guard
