-- Formatting helpers shared by server and client.

local Format = {}

-- 1234567 -> "1,234,567"
function Format.Commas(n: number): string
	n = math.floor(n + 0.5)
	local negative = n < 0
	local s = tostring(math.abs(n))
	local out = s:reverse():gsub("(%d%d%d)", "%1,"):reverse()
	if out:sub(1, 1) == "," then
		out = out:sub(2)
	end
	return (negative and "-" or "") .. out
end

-- 1234567 -> "$1,234,567"
function Format.Money(n: number): string
	if n < 0 then
		return "-$" .. Format.Commas(-n)
	end
	return "$" .. Format.Commas(n)
end

-- 1234567 -> "$1.23M"
function Format.MoneyShort(n: number): string
	local a = math.abs(n)
	local sign = n < 0 and "-" or ""
	if a >= 1e12 then
		return string.format("%s$%.2fT", sign, a / 1e12)
	elseif a >= 1e9 then
		return string.format("%s$%.2fB", sign, a / 1e9)
	elseif a >= 1e6 then
		return string.format("%s$%.2fM", sign, a / 1e6)
	elseif a >= 1e4 then
		return string.format("%s$%.1fK", sign, a / 1e3)
	end
	return sign .. "$" .. Format.Commas(a)
end

-- seconds -> "1h 05m" / "4m 03s"
function Format.Duration(seconds: number): string
	seconds = math.max(0, math.floor(seconds))
	local h = seconds // 3600
	local m = (seconds % 3600) // 60
	local s = seconds % 60
	if h > 0 then
		return string.format("%dh %02dm", h, m)
	elseif m > 0 then
		return string.format("%dm %02ds", m, s)
	end
	return string.format("%ds", s)
end

-- 13.5 -> "1:30 PM"
function Format.ClockTime(clock: number): string
	local hour = math.floor(clock) % 24
	local minute = math.floor((clock - math.floor(clock)) * 60)
	local suffix = hour >= 12 and "PM" or "AM"
	local h12 = hour % 12
	if h12 == 0 then
		h12 = 12
	end
	return string.format("%d:%02d %s", h12, minute, suffix)
end

function Format.Percent(x: number): string
	return string.format("%d%%", math.floor(x * 100 + 0.5))
end

return Format
