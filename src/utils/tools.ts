/**
 * Read a property off an untyped value — a caught error, a remote JSON body —
 * without casting at every call site. `readField` returns `undefined` when the
 * property is absent; `readString` only accepts non-empty strings, so callers
 * can treat `null` as "the other side did not send this".
 */
export const readField = (value: unknown, key: string): unknown => {
	if (typeof value !== "object" || value === null || !(key in value)) return undefined;
	return (value as Record<string, unknown>)[key];
};

export const readString = (value: unknown, key: string): string | null => {
	const raw = readField(value, key);
	return typeof raw === "string" && raw.trim().length > 0 ? raw.trim() : null;
};

export const simpleIntegerHash = (address: string): number => {
	let hashValue = 0;
	for (let i = 0; i < address.length; i++) {
		const charCode = address.charCodeAt(i);
		hashValue = (hashValue * 31 + charCode) % 2 ** 24; // Modulo to keep it small (0 to 65535)
	}
	return hashValue;
};
