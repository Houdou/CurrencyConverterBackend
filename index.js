const express = require('express');
const path = require('path');
const moment = require('moment');
const redis = require('redis');
const request = require('request');
const client = redis.createClient(process.env.REDIS_URL);

// Promisify redis operation
const {promisify} = require('util');
const getAsync = promisify(client.get).bind(client);
const setAsync = promisify(client.set).bind(client);

client.on("error", (err) => {
    console.error(err);
});

const server = new express();

// API Configs
const APP_ID = '4620e0f26b724018bcfede029e33df77';
const CURRENCIES_API_URL = 'https://openexchangerates.org/api/currencies.json';
const LATEST_API_URL = 'https://openexchangerates.org/api/latest.json';
const HISTORY_API_URL = 'https://openexchangerates.org/api/historical/';
server.set('port', (process.env.PORT || 3000));

const requestCurrencies = () => {
	return new Promise((resolve, reject) => {
		request(`${CURRENCIES_API_URL}`,
			(err, api_res, body) => {
				if(err)
					reject(err);
				else if(api_res.statusCode == 200)
					resolve(body);
				else
					reject(new Error(`Unable to request currencies, ERR_CODE: ${api_res.statusCode}`));
			});
	});
}

// Request latest rates data
const requestLatest = () => {
	return new Promise((resolve, reject) => {
		request(`${LATEST_API_URL}?app_id=${APP_ID}`,
			(err, api_res, body) => {
				if(err)
					reject(err);
				else if(api_res.statusCode == 200)
					resolve(body);
				else
					reject(new Error(`Unable to request latest rates, ERR_CODE: ${api_res.statusCode}`));
			});
	});
};

// Request history rates data
const requestHistory = (date) => {
	return new Promise((resolve, reject) => {
		request(`${HISTORY_API_URL}${date}.json?app_id=${APP_ID}`,
			(err, api_res, body) => {
				if(err)
					reject(err);
				else if(api_res.statusCode == 200)
					resolve(body);
				else
					reject(new Error(`Unable to request history rates, ERR_CODE: ${api_res.statusCode}`));
			});
	});
};

// Default timeout for the api request
const timeout = (time) => {
	return new Promise((resolve, reject) => {
		setTimeout(() => {
			reject("Timeout");
		}, time);
	})
};

// Handle currencies request
server.get('/api/currencies.json', (req, res) => {
	const currencies_key = "CURRENCIES";
	// Verify if cached rates are available
	getAsync(currencies_key).then(redis_res => {
		const is_cached = redis_res != null && redis_res !== "null";

		if(is_cached) {
			console.log(`Use cached ${currencies_key}`);
			res.end(redis_res);
		} else {
			// Request data
			Promise.race([requestCurrencies(), timeout(5000)])
				.then((result) => {
					// Cache the result
					setAsync(currencies_key, result)
						.then(redis_set_res => {
							if(redis_set_res === "OK") {
								console.log(`${currencies_key} cached.`);
							}
						});

					res.end(result);
				})
				.catch((err) => {
					console.error(err);
				});
		}
	});
});

// Handle latest rates request
server.get('/api/latest.json', (req, res) => {
	const current_hour_key = new moment().format('YYYY-MM-DD:HH');
	// Try cache
	getAsync(current_hour_key).then(redis_res => {
		const is_cached = redis_res != null && redis_res !== "null";

		if(is_cached) {
			console.log(`Use cached ${current_hour_key} rates`);
			res.end(redis_res);
		} else {
			// Request data
			Promise.race([requestLatest(), timeout(5000)])
				.then((result) => {
					// Cache the result
					setAsync(current_hour_key, result)
						.then(redis_set_res => {
							if(redis_set_res === "OK") {
								console.log(`${current_hour_key} rates cached.`);
							}
						});

					res.end(result);
				})
				.catch((err) => {
					console.error(err);
				});
		}
	});
});

// Handle history rates request
server.get('/api/history/:date.json', (req, res) => {
	const date_key = req.params.date;
	// Try cache
	getAsync(date_key).then(redis_res => {
		const is_cached = redis_res != null && redis_res !== "null";

		if(is_cached) {
			console.log(`Use cached ${date_key} rates`);
			res.end(redis_res);
		} else {
			// Request data
			Promise.race([requestHistory(date_key), timeout(5000)])
				.then((result) => {
					// Cache the result
					setAsync(date_key, result)
						.then(redis_set_res => {
							if(redis_set_res === "OK") {
								console.log(`${date_key} rates cached.`);
							}
						});

					res.end(result);
				})
				.catch((err) => {
					console.error(err);
				});
		}
	});
})

server.use('/', express.static(path.join(__dirname, './public')));

server.listen(server.get('port'), () => {
	console.log('Currency converter backend on port: ' + server.get('port'));
});