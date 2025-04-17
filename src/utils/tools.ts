export const simpleIntegerHash = (address: string): number => {
	let hashValue = 0;
	for (let i = 0; i < address.length; i++) {
		const charCode = address.charCodeAt(i);
		hashValue = (hashValue * 31 + charCode) % 2 ** 24; // Modulo to keep it small (0 to 65535)
	}
	return hashValue;
};
