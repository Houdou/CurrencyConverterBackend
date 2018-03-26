const express = require('express');
const path = require('path');

const server = new express();

const PORT = 3001;

server.get('/api/latest.json', (req, res) => {
	// Try cache
	res.json();
});

server.use(express.static(path.join(__dirname, '../public')));

server.listen(PORT, () => {
	console.log('Currency converter backend on port: ' + PORT);
});