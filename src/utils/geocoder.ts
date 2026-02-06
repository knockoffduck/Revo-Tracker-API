export type GeocodeResult = { lat: number; lon: number } | { error: string };

export const getCoordinates = async (query: string): Promise<GeocodeResult> => {
    try {
        // Nominatim requires a user-agent
        const response = await fetch(
            `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
                query
            )}&format=json&limit=1`,
            {
                headers: {
                    "User-Agent": "RevoTrackerAPI/1.0"
                }
            }
        );

        if (!response.ok) {
            return { error: `HTTP Error ${response.status}: ${response.statusText}` };
        }

        const data: any = await response.json();

        if (data && data.length > 0) {
            return {
                lat: parseFloat(data[0].lat),
                lon: parseFloat(data[0].lon),
            };
        }
        return { error: "No results found" };
    } catch (error: any) {
        console.error("Error geocoding query:", query, error);
        return { error: `Exception: ${error.message || error}` };
    }
};
