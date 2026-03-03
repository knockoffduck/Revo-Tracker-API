import { HttpsProxyAgent } from "https-proxy-agent";

type ProxyConfig = {
	httpsAgent?: HttpsProxyAgent;
	proxyLabel: string;
};

const isInsecureTlsEnabled = () => {
	const flag = process.env.PROXY_INSECURE_TLS;
	if (!flag) return false;
	return flag === "1" || flag.toLowerCase() === "true";
};

const buildProxyUrl = () => {
	const domainName = process.env.DOMAIN_NAME;
	const proxyPort = process.env.PROXY_PORT;
	const proxyUsername = process.env.PROXY_USERNAME;
	const proxyPassword = process.env.PROXY_PASSWORD;

	if (!domainName || !proxyPort || !proxyUsername || !proxyPassword) {
		return null;
	}

	return `http://${proxyUsername}:${proxyPassword}@${domainName}:${proxyPort}`;
};

export const getProxyConfig = (context: string): ProxyConfig => {
	const domainName = process.env.DOMAIN_NAME;
	const proxyPort = process.env.PROXY_PORT;
	const proxyUrl = buildProxyUrl();
	const insecureTls = isInsecureTlsEnabled();

	if (!proxyUrl || !domainName || !proxyPort) {
		console.warn(`[${context}] Proxy env missing; using direct connection.`);
		return { proxyLabel: "Direct Connection" };
	}

	console.log(`[${context}] Using proxy ${domainName}:${proxyPort}`);
	const agent = new HttpsProxyAgent(proxyUrl);
	if (insecureTls) {
		agent.options.rejectUnauthorized = false;
		console.warn(`[${context}] TLS verification disabled for proxy requests.`);
	}

	return {
		httpsAgent: agent,
		proxyLabel: `${domainName}:${proxyPort}`,
	};
};
