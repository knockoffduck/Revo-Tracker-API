import { Hono } from "hono";

const app = new Hono();

app.get("/", (c) => {
	return c.text("API Home");
});

app.get("/api/gyms/stats/update", (c) => {
	return c.text("Hello Hono!");
});

export default {
	port: 3001,
	fetch: app.fetch,
};
