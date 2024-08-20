import axios from "axios";
import "colors";
import { input, select } from "@inquirer/prompts";
import { TelegramClient, Api } from "telegram";
import { StringSession } from "telegram/sessions";
import Database from "better-sqlite3";
import env from "./env";
import { HttpsProxyAgent } from "https-proxy-agent";

const db = new Database("accounts.db");

const PERCENT_WIN = 0.9;

const ensureTableExists = () => {
	const tableExists = db
		.prepare(
			"SELECT name FROM sqlite_master WHERE type='table' AND name='accounts';",
		)
		.get();

	if (!tableExists) {
		db.prepare(`
            CREATE TABLE accounts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                phoneNumber TEXT,
                session TEXT,
                proxy TEXT
            );
        `).run();
	}
};

const _headers = {
	Accept: "application/json",
	"Accept-Encoding": "gzip, deflate, br, zstd",
	"Accept-Language": "en-US,en;q=0.9",
	"App-Type": "mobile",
	"Content-Type": "application/json",
	Origin: "https://www.okx.com",
	Referer:
		"https://www.okx.com/mini-app/racer?tgWebAppStartParam=linkCode_95903147",
	"Sec-Ch-Ua":
		'"Not/A)Brand";v="8", "Chromium";v="126", "Mobile Safari";v="605.1.15"',
	"Sec-Ch-Ua-Mobile": "?1",
	"Sec-Ch-Ua-Platform": '"iOS"',
	"Sec-Fetch-Dest": "empty",
	"Sec-Fetch-Mode": "cors",
	"Sec-Fetch-Site": "same-origin",
	"User-Agent":
		"Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1",
	"X-Cdn": "https://www.okx.com",
	"X-Locale": "en_US",
	"X-Utc": "7",
	"X-Zkdex-Env": "0",
	"X-Telegram-Platform": "ios",
};

const createSession = async (phoneNumber: string, proxy: string) => {
	try {
		const client = new TelegramClient(
			new StringSession(""),
			env.APP_ID,
			env.API_HASH,
			{
				deviceModel: env.DEVICE_MODEL,
				connectionRetries: 5,
			},
		);

		await client.start({
			phoneNumber: async () => phoneNumber,
			password: async () => await input({ message: "Enter your password:" }),
			phoneCode: async () =>
				await input({ message: "Enter the code you received:" }),
			onError: (err: Error) => {
				if (
					!err.message.includes("TIMEOUT") &&
					!err.message.includes("CastError")
				) {
					console.log(`Telegram authentication error: ${err.message}`.red);
				}
			},
		});

		console.log("Successfully created a new session!".green);
		const stringSession = client.session.save() as unknown as string;

		db.prepare(
			"INSERT INTO accounts (phoneNumber, session, proxy) VALUES (@phoneNumber, @session, @proxy)",
		).run({ phoneNumber, session: stringSession, proxy });

		await client.sendMessage("me", {
			message: "Successfully created a new session!",
		});
		console.log("Saved the new session to session file.".green);
		await client.disconnect();
		await client.destroy();
	} catch (e) {
		const error = e as Error;
		if (
			!error.message.includes("TIMEOUT") &&
			!error.message.includes("CastError")
		) {
			console.log(`Error: ${error.message}`.red);
		}
	}
};

const showAllAccounts = () => {
	const stmt = db.prepare("SELECT phoneNumber, proxy FROM accounts");
	for (const row of stmt.iterate()) {
		console.log(row);
	}
};

const getQueryId = async (phoneNumber: string, session: string) => {
	const client = new TelegramClient(
		new StringSession(session),
		env.APP_ID,
		env.API_HASH,
		{
			deviceModel: env.DEVICE_MODEL,
			connectionRetries: 5,
		},
	);

	await client.start({
		phoneNumber: async () => phoneNumber,
		password: async () => await input({ message: "Enter your password:" }),
		phoneCode: async () =>
			await input({ message: "Enter the code you received:" }),
		onError: (err: Error) => {
			if (
				!err.message.includes("TIMEOUT") &&
				!err.message.includes("CastError")
			) {
				console.log(`Telegram authentication error: ${err.message}`.red);
			}
		},
	});

	try {
		const peer = await client.getInputEntity("OKX_official_bot");
		if (!peer) {
			console.log("Failed to get peer entity.".red);
			return;
		}
		const webview = await client.invoke(
			new Api.messages.RequestWebView({
				peer,
				bot: peer,
				fromBotMenu: false,
				platform: "ios",
				url: "https://www.okx.com/",
			}),
		);
		if (!webview || !webview.url) {
			console.log("Failed to get webview URL.".red);
			return;
		}
		const query = decodeURIComponent(
			webview.url.split("&tgWebAppVersion=")[0].split("#tgWebAppData=")[1],
		);

		return query;
	} catch (e) {
		console.log(`Error retrieving query data: ${(e as Error).message}`.red);
	} finally {
		await client.disconnect();
		await client.destroy();
	}
};

const getRandomInt = (min: number, max: number) =>
	Math.floor(Math.random() * (max - min + 1)) + min;

const extractUserData = (queryId: string) => {
	const urlParams = new URLSearchParams(queryId);
	const user = JSON.parse(decodeURIComponent(urlParams.get("user") ?? ""));
	return {
		extUserId: user.id,
		extUserName: user.username,
	};
};

const performCheckIn = async (
	prefix: string,
	extUserId: string,
	taskId: number,
	queryId: string,
	proxy: string,
) => {
	const url = `https://www.okx.com/priapi/v1/affiliate/game/racer/task?t=${Date.now()}`;
	const headers = { ..._headers, "X-Telegram-Init-Data": queryId };
	const payload = {
		extUserId: extUserId,
		id: taskId,
	};

	try {
		await axios.post(
			url,
			payload,
			proxy ? { headers, httpsAgent: new HttpsProxyAgent(proxy) } : { headers },
		);
		console.log(prefix, "Daily attendance successfully!");
	} catch (e) {
		const error = e as Error;
		console.log(prefix, `Error: ${error.message}`);
	}
};

const checkDailyRewards = async (
	prefix: string,
	extUserId: string,
	queryId: string,
	proxy: string,
) => {
	const url = `https://www.okx.com/priapi/v1/affiliate/game/racer/tasks?t=${Date.now()}`;
	const headers = { ..._headers, "X-Telegram-Init-Data": queryId };
	try {
		const response = await axios.get(
			url,
			proxy ? { headers, httpsAgent: new HttpsProxyAgent(proxy) } : { headers },
		);
		const tasks = response.data.data;
		const dailyCheckInTask = tasks.find(
			(task: { id: number }) => task.id === 4,
		);
		if (dailyCheckInTask) {
			if (dailyCheckInTask.state === 0) {
				console.log(prefix, "Start checkin...");
				await performCheckIn(
					prefix,
					extUserId,
					dailyCheckInTask.id,
					queryId,
					proxy,
				);
			} else {
				console.log(prefix, "Today you have attended!");
			}
		}
	} catch (e) {
		const error = e as Error;
		console.log(`Daily reward check error: ${error.message}`);
	}
};

const getBoosts = async (
	queryId: string,
	proxy: string,
): Promise<
	{
		id: number;
		curStage: number;
		totalStage: number;
		pointCost: number;
		context: { name: string };
	}[]
> => {
	const url = `https://www.okx.com/priapi/v1/affiliate/game/racer/boosts?t=${Date.now()}`;
	const headers = { ..._headers, "X-Telegram-Init-Data": queryId };

	try {
		const response = await axios.get(
			url,
			proxy ? { headers, httpsAgent: new HttpsProxyAgent(proxy) } : { headers },
		);

		if (response?.data?.data) {
			return response.data.data;
		}

		console.log("Boost Information Error: No data found".red);
		return [];
	} catch (e) {
		const error = e as Error;

		console.log(`Boost Information Error: ${error.message}`.red);
		return [];
	}
};

const useBoost = async (prefix: string, queryId: string, proxy: string) => {
	const url = `https://www.okx.com/priapi/v1/affiliate/game/racer/boost?t=${Date.now()}`;
	const headers = { ..._headers, "X-Telegram-Init-Data": queryId };

	const payload = { id: 1 };

	try {
		const response = await axios.post(
			url,
			payload,
			proxy ? { headers, httpsAgent: new HttpsProxyAgent(proxy) } : { headers },
		);

		if (response.data && response.data.code === 0) {
			console.log(prefix, "Reload Fuel Tank successfully!".yellow);
			await new Promise((res) => setTimeout(res, getRandomInt(1, 10) * 1e3));
		} else {
			console.log(
				prefix,
				`Error Reload Fuel Tank: ${response.data ? response.data.msg : "Unknown error"}`
					.red,
			);
		}
	} catch (e) {
		const error = e as Error;
		console.log(prefix, `Error: ${error.message}`.red);
	}
};

const upgradeFuelTank = async (
	prefix: string,
	queryId: string,
	proxy: string,
) => {
	const url = `https://www.okx.com/priapi/v1/affiliate/game/racer/boost?t=${Date.now()}`;
	const headers = { ..._headers, "X-Telegram-Init-Data": queryId };

	const payload = { id: 2 };

	try {
		const response = await axios.post(
			url,
			payload,
			proxy ? { headers, httpsAgent: new HttpsProxyAgent(proxy) } : { headers },
		);
		if (response.data && response.data.code === 0) {
			console.log(prefix, "Successful Fuel Tank upgrade!".yellow);
		} else {
			console.log(
				prefix,
				`Fuel tank upgrade error: ${response.data ? response.data.msg : "Unknown error"}`
					.red,
			);
		}
	} catch (e) {
		const error = e as Error;
		console.log(`Error: ${error.message}`.red);
	}
};

const upgradeTurbo = async (prefix: string, queryId: string, proxy: string) => {
	const url = `https://www.okx.com/priapi/v1/affiliate/game/racer/boost?t=${Date.now()}`;
	const headers = { ..._headers, "X-Telegram-Init-Data": queryId };

	const payload = { id: 3 };

	try {
		const response = await axios.post(
			url,
			payload,
			proxy ? { headers, httpsAgent: new HttpsProxyAgent(proxy) } : { headers },
		);
		if (response.data && response.data.code === 0) {
			console.log(prefix, "Successful Turbo Charger upgrade!".yellow);
		} else {
			console.log(
				prefix,
				`Turbo Charger upgrade error: ${response.data ? response.data.msg : "Unknown error"}`
					.red,
			);
		}
	} catch (e) {
		const error = e as Error;
		console.log(prefix, `Error: ${error.message}`.red);
	}
};

const getInfo = async (
	extUserId: string,
	extUserName: string,
	queryId: string,
	proxy: string,
) => {
	const url = `https://www.okx.com/priapi/v1/affiliate/game/racer/info?t=${Date.now()}`;
	const headers = { ..._headers, "X-Telegram-Init-Data": queryId };
	const payload = {
		extUserId,
		extUserName,
		gameId: 1,
		linkCode: "95903147",
	};

	return axios.post(
		url,
		payload,
		proxy ? { headers, httpsAgent: new HttpsProxyAgent(proxy) } : { headers },
	);
};

const getCurrentPrice = async (proxy: string) => {
	const url = "https://www.okx.com/api/v5/market/ticker?instId=BTC-USDT";

	const response = await axios.get(
		url,
		proxy ? { httpsAgent: new HttpsProxyAgent(proxy) } : {},
	);
	if (
		response.data.code === "0" &&
		response.data.data &&
		response.data.data.length > 0
	) {
		return Number.parseFloat(response.data.data[0].last);
	}
	throw new Error("Error when taking the current price");
};

const getAssess = async (
	extUserId: string,
	predict: number,
	queryId: string,
	proxy: string,
) => {
	const url = `https://www.okx.com/priapi/v1/affiliate/game/racer/assess?t=${Date.now()}`;
	const headers = { ..._headers, "X-Telegram-Init-Data": queryId };
	const payload = {
		extUserId: extUserId,
		predict: predict,
		gameId: 1,
	};

	return axios.post(
		url,
		payload,
		proxy ? { headers, httpsAgent: new HttpsProxyAgent(proxy) } : { headers },
	);
};

const farm = async (account: {
	phoneNumber: string;
	session: string;
	proxy: string;
}) => {
	const { phoneNumber, session, proxy } = account;
	const queryId = await getQueryId(phoneNumber, session);

	if (!queryId) {
		console.log(`Failed to get query data for ${phoneNumber}`.red);
		return;
	}

	const { extUserId, extUserName } = extractUserData(queryId);
	const prefix = `[${extUserId}]`.blue;

	while (true) {
		try {
			await checkDailyRewards(prefix, extUserId, queryId, proxy);

			let boosts = await getBoosts(queryId, proxy);
			for (const boost of boosts) {
				console.log(
					prefix,
					`${boost.context.name.green}: ${boost.curStage}/${boost.totalStage}`,
				);
			}
			let reloadFuelTank = boosts.find((boost) => boost.id === 1);
			const fuelTank = boosts.find((boost) => boost.id === 2);
			const turbo = boosts.find((boost) => boost.id === 3);

			if (env.UPGRADE_FUEL_TANK && fuelTank) {
				const balanceResponse = await getInfo(
					extUserId,
					extUserName,
					queryId,
					proxy,
				);
				const balancePoints = balanceResponse.data.data.balancePoints;
				if (
					fuelTank.curStage < fuelTank.totalStage &&
					balancePoints > fuelTank.pointCost
				) {
					await upgradeFuelTank(prefix, queryId, proxy);
					boosts = await getBoosts(queryId, proxy);
					const updatedFuelTank = boosts.find((boost) => boost.id === 2);
					const updatebalanceResponse = await getInfo(
						extUserId,
						extUserName,
						queryId,
						proxy,
					);
					const updatedBalancePoints =
						updatebalanceResponse.data.data.balancePoints;
					if (
						(updatedFuelTank &&
							updatedFuelTank.curStage >= fuelTank.totalStage) ||
						updatedBalancePoints < fuelTank.pointCost
					) {
						console.log(prefix, "Not eligible to upgrade Fuel Tank!".red);
						// continue;
					}
				} else {
					console.log(prefix, "Not eligible to upgrade Fuel Tank!".red);
				}
			}

			if (env.UPGRADE_TURBO_CHARGER && turbo) {
				const balanceResponse = await getInfo(
					extUserId,
					extUserName,
					queryId,
					proxy,
				);
				const balancePoints = balanceResponse.data.data.balancePoints;
				if (
					turbo.curStage < turbo.totalStage &&
					balancePoints > turbo.pointCost
				) {
					await upgradeTurbo(prefix, queryId, proxy);
					boosts = await getBoosts(queryId, proxy);
					const updatedTurbo = boosts.find((boost) => boost.id === 3);
					const updatebalanceResponse = await getInfo(
						extUserId,
						extUserName,
						queryId,
						proxy,
					);
					const updatedBalancePoints =
						updatebalanceResponse.data.data.balancePoints;
					if (
						(updatedTurbo && updatedTurbo.curStage >= turbo.totalStage) ||
						updatedBalancePoints < turbo.pointCost
					) {
						console.log(prefix, "Upgrading Turbo Charger failed!".red);
						// continue;
					}
				} else {
					console.log(prefix, "Not eligible to upgrade Turbo Charger!".red);
				}
			}

			let queryTime = 1e3;
			while (true) {
				try {
					if (queryTime > 4e3) {
						console.error(prefix, `Bad proxy ${proxy}`);
					}
					const price1 = await getCurrentPrice(proxy);
					await new Promise((res) =>
						setTimeout(res, Math.max(5e3 - queryTime, 0)),
					);
					const calcQueryTime = +new Date();
					const price2 = await getCurrentPrice(proxy);

					let predict = price1 > price2 ? 0 : 1;
					if (Math.random() > PERCENT_WIN) {
						console.log(prefix, "Need lose".red);
						predict = predict === 0 ? 1 : 0;
					}

					const assessData = (
						await getAssess(extUserId, predict, queryId, proxy)
					).data.data;
					queryTime = +new Date() - calcQueryTime;
					const result = assessData.won ? "Win".green : "Lose".red;
					const calculatedValue = assessData.basePoint * assessData.multiplier;
					console.log(
						prefix,
						`${predict ? "Buy ".magenta : "Sell".magenta} | ${result} x ${assessData.multiplier}! Balance: ${assessData.balancePoints} (+${calculatedValue}), Old price: ${assessData.prevPrice}, New price: ${assessData.currentPrice}`,
					);

					if (assessData.numChance > 0) {
						await new Promise((res) =>
							setTimeout(res, getRandomInt(1, 3) * 1e3),
						);
					} else if (
						assessData.numChance <= 0 &&
						reloadFuelTank &&
						reloadFuelTank.curStage < reloadFuelTank.totalStage
					) {
						await useBoost(prefix, queryId, proxy);
						boosts = await getBoosts(queryId, proxy);
						reloadFuelTank = boosts.find((boost) => boost.id === 1);
					} else {
						break;
					}
				} catch (err) {
					const error = err as Error;
					console.error(prefix, "error".red, error.message);
					break;
				}
			}

			const balanceResponse = await getInfo(
				extUserId,
				extUserName,
				queryId,
				proxy,
			);

			const sleep =
				90 * getRandomInt(2, balanceResponse.data.data.numChancesTotal) * 1e3;
			console.log(
				prefix,
				`Sleep for ${sleep / 1e3} seconds before the next loop`,
			);
			await new Promise((res) => setTimeout(res, sleep));
		} catch (e) {
			const error = e as Error;
			console.log(prefix, `${"Error farm:".red} ${error.message}`);
			await new Promise((res) => setTimeout(res, 5 * 60 * 1e3));
		}
	}
};

const start = async () => {
	const stmt = db.prepare("SELECT phoneNumber, session, proxy FROM accounts");
	const accounts = [...stmt.iterate()] as {
		phoneNumber: string;
		session: string;
		proxy: string;
	}[];

	await Promise.all(accounts.map(farm));
};

(async () => {
	ensureTableExists();

	while (true) {
		const mode = await select({
			message: "Please choose an option:",
			choices: [
				{
					name: "Start farming",
					value: "start",
					description: "Start playing game",
				},
				{
					name: "Add account",
					value: "add",
					description: "Add new account to DB",
				},
				{
					name: "Show all accounts",
					value: "show",
					description: "show all added accounts",
				},
			],
		});

		switch (mode) {
			case "add": {
				const phoneNumber = await input({
					message: "Enter your phone number (+):",
				});

				const proxy = await input({
					message:
						"Enter proxy (in format http://username:password@host:port):",
				});

				await createSession(phoneNumber, proxy);
				break;
			}
			case "show": {
				showAllAccounts();
				break;
			}
			case "start": {
				await start();
				break;
			}
			default:
				break;
		}
	}
})();
