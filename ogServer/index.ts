import axios from "axios";
import * as cheerio from "cheerio";

// Function to fetch and extract gym details including size and member count
async function getGymDetails() {
	try {
		// Fetch the HTML from the Revo Fitness page
		const response = await axios.get(
			"https://revofitness.com.au/livemembercount/"
		);

		// Load the HTML into cheerio
		const $ = cheerio.load(response.data);

		const currentTime = new Date();
		console.log(currentTime);

		// Initialize an array to hold the formatted gym data
		const gymData: {
			GymName: string;
			Size: number;
			LiveMemberCount: number;
			MemberAreaRatio: number;
			Percentage: number;
		}[] = [];

		// Find all divs with the attribute 'data-counter-card' (for gym info)
		$("div[data-counter-card]").each((i, element) => {
			const gymName = $(element).attr("data-counter-card"); // Extract the gym name from the attribute
			const size = Number(
				$(element)
					.find("span.is-h6")
					.last()
					.text()
					.trim()
					.replace(/\s+/g, "")
					.replace(/sq\/m/g, "")
			); // Extract and clean size
			// Extract the size (sqm)

			// Find the corresponding member count in 'span[data-live-count]'
			const memberCount = Number(
				$(`span[data-live-count="${gymName}"]`).text().trim()
			); // Match gym with live member count

			if (gymName && size && memberCount) {
				// Push the formatted object into the gymData array
				const memberAreaRatio = size / memberCount;

				gymData.push({
					GymName: gymName,
					Size: size, // Remove extra whitespaces from the size
					LiveMemberCount: memberCount,
					MemberAreaRatio: memberAreaRatio,
					Percentage:
						(1 - (memberAreaRatio > 50 ? 50 : memberAreaRatio) / 50) * 100,
				});
			}
		});

		// Output the formatted gym data as JSON
		console.log(JSON.stringify(gymData.slice(0, 10), null, 1));
	} catch (error) {
		console.error("Error fetching gym details:", error);
	}
}

// Execute the function
getGymDetails();
