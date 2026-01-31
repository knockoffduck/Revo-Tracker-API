export const handleSuccess = (ctx: any, data: any, status: number = 200) => {
	return ctx.json(
		{
			message: "Success",
			data: data,
		},
		status
	);
};

// Error handler
export const handleError = (ctx: any, error: any, status: number = 500) => {
	console.error("Error inserting data:", error);

	return ctx.json(
		{
			message: "Failed",
			error: error.message || error,
		},
		status
	);
};
