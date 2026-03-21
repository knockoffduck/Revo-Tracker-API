import axios from "axios";

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_USER_ID = process.env.TELEGRAM_USER_ID;

const TG_API = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

interface AlertLevel {
	emoji: string;
	prefix: string;
}

const ALERT = {
	error: { emoji: "🔴", prefix: "ERROR" },
	warning: { emoji: "🟡", prefix: "WARNING" },
	info: { emoji: "🔵", prefix: "INFO" },
};

type AlertType = keyof typeof ALERT;

const sendTelegram = async (message: string): Promise<boolean> => {
	if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_USER_ID) {
		console.warn("[Alert] Telegram credentials not configured (TELEGRAM_BOT_TOKEN / TELEGRAM_USER_ID)");
		return false;
	}

	try {
		await axios.get(`${TG_API}/sendMessage`, {
			params: {
				chat_id: TELEGRAM_USER_ID,
				text: message,
				parse_mode: "HTML",
			},
			timeout: 10000,
		});
		return true;
	} catch (e) {
		console.error("[Alert] Failed to send Telegram message:", e instanceof Error ? e.message : e);
		return false;
	}
};

export const sendAlert = async (type: AlertType, title: string, details: string): Promise<void> => {
	const { emoji, prefix } = ALERT[type];
	const timestamp = new Date().toISOString();

	const message = [
		`${emoji} <b>${prefix}: ${title}</b>`,
		``,
		details,
		``,
		`<code>${timestamp}</code>`,
	].join("\n");

	const ok = await sendTelegram(message);
	if (ok) {
		console.log(`[Alert] ${prefix}: ${title} — sent to Telegram`);
	} else {
		console.warn(`[Alert] ${prefix}: ${title} — Telegram send failed (credentials may be missing)`);
	}
};
