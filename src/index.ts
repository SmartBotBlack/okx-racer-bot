import axios from "axios";
import "colors";
import fs from "node:fs";
import path from "node:path";

const PERCENT_WIN = 0.9;

const _headers = {
	Accept: "application/json",
	"Accept-Encoding": "gzip, deflate, br, zstd",
	"Accept-Language": "en-US,en;q=0.9",
	"App-Type": "web",
	"Content-Type": "application/json",
	Origin: "https://www.okx.com",
	Referer:
		"https://www.okx.com/mini-app/racer?tgWebAppStartParam=linkCode_95903147",
	"Sec-Ch-Ua":
		'"Not/A)Brand";v="8", "Chromium";v="126", "Microsoft Edge";v="126"',
	"Sec-Ch-Ua-Mobile": "?0",
	"Sec-Ch-Ua-Platform": '"Windows"',
	"Sec-Fetch-Dest": "empty",
	"Sec-Fetch-Mode": "cors",
	"Sec-Fetch-Site": "same-origin",
	"User-Agent":
		"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0",
	"X-Cdn": "https://www.okx.com",
	"X-Locale": "en_US",
	"X-Utc": "7",
	"X-Zkdex-Env": "0",
};

const getRandomInt = (min, max) =>
	Math.floor(Math.random() * (max - min + 1)) + min;

const extractQueryString = (url: string): string => {
	const hashIndex = url.indexOf("#");

	if (hashIndex === -1) return "";

	let queryString = url.substring(hashIndex + 1);

	const tgWebAppVersionIndex = queryString.indexOf("&tgWebAppVersion");
	if (tgWebAppVersionIndex !== -1) {
		queryString = queryString.substring(0, tgWebAppVersionIndex);
	}

	if (queryString.startsWith("tgWebAppData=")) {
		queryString = queryString.substring("tgWebAppData=".length);
	}

	return decodeURIComponent(queryString);
};

const extractUserData = (queryId) => {
	const urlParams = new URLSearchParams(queryId);
	const user = JSON.parse(decodeURIComponent(urlParams.get("user") ?? ""));
	return {
		extUserId: user.id,
		extUserName: user.username,
	};
};

const performCheckIn = async (extUserId, taskId, queryId) => {
	const url = `https://www.okx.com/priapi/v1/affiliate/game/racer/task?t=${Date.now()}`;
	const headers = { ..._headers, "X-Telegram-Init-Data": queryId };
	const payload = {
		extUserId: extUserId,
		id: taskId,
	};

	try {
		await axios.post(url, payload, { headers });
		console.log("Daily attendance successfully!");
	} catch (error) {
		console.log(`Error: ${error.message}`);
	}
};

const checkDailyRewards = async (extUserId, queryId) => {
	const url = `https://www.okx.com/priapi/v1/affiliate/game/racer/tasks?t=${Date.now()}`;
	const headers = { ..._headers, "X-Telegram-Init-Data": queryId };
	try {
		const response = await axios.get(url, { headers });
		const tasks = response.data.data;
		const dailyCheckInTask = tasks.find((task) => task.id === 4);
		if (dailyCheckInTask) {
			if (dailyCheckInTask.state === 0) {
				console.log("Start checkin ... ");
				await performCheckIn(extUserId, dailyCheckInTask.id, queryId);
			} else {
				console.log("Today you have attended!");
			}
		}
	} catch (error) {
		console.log(`Daily reward check error: ${error.message}`);
	}
};

const getInfo = async (extUserId, extUserName, queryId) => {
	const url = `https://www.okx.com/priapi/v1/affiliate/game/racer/info?t=${Date.now()}`;
	const headers = { ..._headers, "X-Telegram-Init-Data": queryId };
	const payload = {
		extUserId,
		extUserName,
		gameId: 1,
		linkCode: "95903147",
	};

	return axios.post(url, payload, { headers });
};

const getCurrentPrice = async () => {
	const url = "https://www.okx.com/api/v5/market/ticker?instId=BTC-USDT";

	const response = await axios.get(url);
	if (
		response.data.code === "0" &&
		response.data.data &&
		response.data.data.length > 0
	) {
		return Number.parseFloat(response.data.data[0].last);
	}
	throw new Error("Error when taking the current price");
};

const getAssess = async (extUserId, predict, queryId) => {
	const url = `https://www.okx.com/priapi/v1/affiliate/game/racer/assess?t=${Date.now()}`;
	const headers = { ..._headers, "X-Telegram-Init-Data": queryId };
	const payload = {
		extUserId: extUserId,
		predict: predict,
		gameId: 1,
	};

	return axios.post(url, payload, { headers });
};

(async () => {
	const dataFile = path.join(__dirname, "..", "data.txt");
	const userData = fs
		.readFileSync(dataFile, "utf8")
		.replace(/\r/g, "")
		.split("\n")
		.filter(Boolean)
		.map(extractQueryString);

	while (true) {
		for (let i = 0; i < userData.length; i++) {
			const queryId = userData[i];
			const { extUserId, extUserName } = extractUserData(queryId);

			console.log(`--------- Account ${i + 1} | ${extUserName} ---------`.blue);

			try {
				await checkDailyRewards(extUserId, queryId);
			} catch (error) {
				console.log(`${"Error check daily:".red} ${error.message}`);
			}

			while (true) {
				try {
					const price1 = await getCurrentPrice();
					await new Promise((res) => setTimeout(res, 4e3));
					const price2 = await getCurrentPrice();

					const info = (await getInfo(extUserId, extUserName, queryId)).data
						.data;
					const balancePoints = info.balancePoints;
					console.log(`${"Balance:".green} ${balancePoints}`);

					let predict = price1 > price2 ? 0 : 1;
					if (Math.random() > PERCENT_WIN) {
						predict = predict === 0 ? 1 : 0;
					}

					const assessData = (await getAssess(extUserId, predict, queryId)).data
						.data;
					const result = assessData.won ? "Win".green : "Lose".red;
					const calculatedValue = assessData.basePoint * assessData.multiplier;
					console.log(
						`${predict ? "Buy" : "Sell"} | ${result} x ${assessData.multiplier}! Balance: ${assessData.balancePoints} (+${calculatedValue}), Old price: ${assessData.prevPrice}, New price: ${assessData.currentPrice}`
							.magenta,
					);

					if (assessData.numChance > 0) {
						await new Promise((res) =>
							setTimeout(res, getRandomInt(1, 5) * 1e3),
						);
					} else {
						break;
					}
				} catch (err) {
					console.error("error", err);
					break;
				}
			}
		}

		await new Promise((res) => setTimeout(res, 90 * 10 * 1e3));
	}
})();
