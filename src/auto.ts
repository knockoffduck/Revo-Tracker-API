// Define the API endpoint you want to hit
const API_URL = "https://revotracker.daffydvck.live/api/gyms/stats/update";

// Function to call the API
async function callApi() {
	try {
		const response = await fetch(API_URL);
		if (!response.ok) {
			throw new Error(`API request failed with status ${response.status}`);
		}
		const data = await response.json();
		console.log("API Response:", data);
	} catch (error) {
		console.error("Error while calling the API:", error);
	}
}

// Call the API every 5 minutes (300000 ms)
setInterval(callApi, 5 * 60 * 1000);

// Initial call to ensure the first execution happens immediately
callApi();
