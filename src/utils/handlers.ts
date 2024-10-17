export const handleSuccess = (ctx: any, data: any) => {
	return ctx.json(
		{
			message: "Success",
			data: data,
		},
		200
	); // Return HTTP 200 OK with data
};

// Error handler
export const handleError = (ctx: any, error: any) => {
	console.error("Error inserting data:", error);

	return ctx.json(
		{
			message: "Failed",
			error: error.message || error,
		},
		500
	); // Return HTTP 500 Internal Server Error
};
