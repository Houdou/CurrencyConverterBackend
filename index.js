const express = require('express');
const path = require('path');
const moment = require('moment');
const redis = require('redis');
const request = require('request');
const client = redis.createClient();

const {promisify} = require('util');
const getAsync = promisify(client.get).bind(client);
const setAsync = promisify(client.set).bind(client);

client.on("error", (err) => {
    console.error(err);
});

const server = new express();

const APP_ID = "4620e0f26b724018bcfede029e33df77";
const LATEST_API_URL = 'https://openexchangerates.org/api/latest.json';
const HISTORY_API_URL = 'https://openexchangerates.org/api/historical/';
const PORT = 3001;

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
					reject(new Error(`Unable to request api, ERR_CODE: ${api_res.statusCode}`));
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
					reject(new Error(`Unable to request api, ERR_CODE: ${api_res.statusCode}`));
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

// Handle latest rates request
server.get('/api/latest.json', (req, res) => {
	let current_hour_key = new moment().format('YYYY-MM-DD:HH');
	// Try cache
	getAsync(current_hour_key).then(redis_res => {
		let is_cached = redis_res != null && redis_res !== "null";

		if(is_cached) {
			console.log(`Use cached ${current_hour_key} rates`);
			res.end(redis_res);
		} else {
			// Request data
			Promise.race([requestLatest(), timeout(5000)])
				.then((result) => {
					// cache the result
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
	let date_key = req.params.date;
	// Try cache
	getAsync(date_key).then(redis_res => {
		let is_cached = redis_res != null && redis_res !== "null";

		if(is_cached) {
			console.log(`Use cached ${date_key} rates`);
			res.end(redis_res);
		} else {
			// Request data
			Promise.race([requestHistory(date_key), timeout(5000)])
				.then((result) => {
					// cache the result
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

server.use(express.static(path.join(__dirname, '../public')));

server.listen(PORT, () => {
	console.log('Currency converter backend on port: ' + PORT);
});