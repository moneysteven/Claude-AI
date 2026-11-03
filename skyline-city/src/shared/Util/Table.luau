-- Table helpers.

local Table = {}

function Table.DeepCopy<T>(t: T): T
	if type(t) ~= "table" then
		return t
	end
	local out = {}
	for k, v in pairs(t :: any) do
		out[k] = Table.DeepCopy(v)
	end
	return (out :: any) :: T
end

-- Fill any keys missing in `target` from `template` (recursively). Never overwrites existing values.
function Table.Reconcile(target: { [any]: any }, template: { [any]: any })
	for k, v in pairs(template) do
		if target[k] == nil then
			target[k] = Table.DeepCopy(v)
		elseif type(v) == "table" and type(target[k]) == "table" then
			-- only reconcile dictionaries that have keys in the template; empty templates are free-form maps
			if next(v) ~= nil and #v == 0 then
				Table.Reconcile(target[k], v)
			end
		end
	end
end

function Table.Count(t: { [any]: any }): number
	local n = 0
	for _ in pairs(t) do
		n += 1
	end
	return n
end

function Table.Keys(t: { [any]: any }): { any }
	local out = {}
	for k in pairs(t) do
		table.insert(out, k)
	end
	return out
end

-- "a.b.c" -> {"a","b","c"}
function Table.SplitPath(path: string): { string }
	local parts = {}
	for part in string.gmatch(path, "[^%.]+") do
		table.insert(parts, part)
	end
	return parts
end

-- Read a value at a dot path. Returns nil if any segment is missing.
function Table.GetPath(root: any, path: string): any
	if path == "" then
		return root
	end
	local node = root
	for _, key in ipairs(Table.SplitPath(path)) do
		if type(node) ~= "table" then
			return nil
		end
		node = node[key]
	end
	return node
end

-- Write a value at a dot path, creating intermediate tables.
function Table.SetPath(root: any, path: string, value: any)
	local parts = Table.SplitPath(path)
	local node = root
	for i = 1, #parts - 1 do
		local key = parts[i]
		if type(node[key]) ~= "table" then
			node[key] = {}
		end
		node = node[key]
	end
	node[parts[#parts]] = value
end

function Table.Shuffle<T>(arr: { T }, rng: Random?): { T }
	local r = rng or Random.new()
	for i = #arr, 2, -1 do
		local j = r:NextInteger(1, i)
		arr[i], arr[j] = arr[j], arr[i]
	end
	return arr
end

return Table
