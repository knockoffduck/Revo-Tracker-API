import axios, { type AxiosRequestConfig, type AxiosResponse } from "axios";
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

const getErrorMessage = (error: unknown) => {
	if (error instanceof Error) return error.message;
	return String(error);
};

const buildDirectRequestConfig = (
	config: AxiosRequestConfig = {}
): AxiosRequestConfig => {
	const directConfig: AxiosRequestConfig = {
		...config,
		proxy: false,
	};

	delete directConfig.httpAgent;
	delete directConfig.httpsAgent;

	return directConfig;
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

export const axiosGetWithProxyFallback = async <T = unknown>(
	context: string,
	url: string,
	config: AxiosRequestConfig = {}
): Promise<AxiosResponse<T>> => {
	const { httpsAgent, proxyLabel } = getProxyConfig(context);
	const directConfig = buildDirectRequestConfig(config);

	if (!httpsAgent) {
		console.log(`[${context}] Using direct connection`);
		return axios.get<T>(url, directConfig);
	}

	try {
		return await axios.get<T>(url, {
			...config,
			httpsAgent,
			proxy: false,
		});
	} catch (proxyError) {
		console.warn(`[${context}] Proxy ${proxyLabel} failed — falling back to direct: ${getErrorMessage(proxyError)}`);

		try {
			return await axios.get<T>(url, directConfig);
		} catch (directError) {
			console.error(`[${context}] Direct fallback also failed: ${getErrorMessage(directError)}`);
			throw directError;
		}
	}
};
