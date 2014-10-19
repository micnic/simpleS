'use strict';

var stream = require('stream'),
	url = require('url'),
	utils = require('simples/utils/utils');

// Abstract connection prototype constructor
var connection = function (host, request) {

	var cookies = [],
		hostname = request.connection.localAddress,
		langs = [],
		protocol = 'http';

	// Getter for request cookies
	function getCookies() {

		// Check if cookies are not already parsed
		if (!cookies.length && request.headers.cookie) {
			cookies = utils.parseCookies(request.headers.cookie);
		}

		return cookies;
	}

	// Getter for request accepted languages
	function getLangs() {

		// Check if languages are not already parsed
		if (!langs.length && request.headers['accept-language']) {
			langs = utils.parseLangs(request.headers['accept-language']);
		}

		return langs;
	}

	// Call stream.Transform in this context
	stream.Transform.call(this);

	// Define private properties for connection
	Object.defineProperties(this, {
		cookies: {
			enumerable: true,
			get: getCookies
		},
		langs: {
			enumerable: true,
			get: getLangs
		},
		parent: {
			value: host
		},
		socket: {
			value: request.connection
		}
	});

	// Get the hostname
	if (request.headers.host) {
		hostname = request.headers.host;
	}

	// Check for protocol type
	if (request.headers.upgrade) {
		protocol = 'ws';
	}

	// Check for secured protocol
	if (this.socket.encrypted) {
		protocol += 's';
	}

	// Create and populate connection members
	this.headers = request.headers;
	this.ip = this.socket.remoteAddress;
	this.protocol = protocol;
	this.session = {};
	this.url = url.parse(protocol + '://' + hostname + request.url, true);
	this.host = this.url.hostname;
	this.path = this.url.pathname;
	this.query = this.url.query;
};

// Inherit from stream.Transform
connection.prototype = Object.create(stream.Transform.prototype, {
	constructor: {
		value: connection
	}
});

// Close the connection
connection.prototype.close = function (callback) {

	// Check for a callback function for the finish event
	if (typeof callback === 'function') {
		this.end(callback);
	} else {
		this.end();
	}
};

// Destroy the connection socket
connection.prototype.destroy = function () {
	this.socket.destroy();
};

// Log data
connection.prototype.log = function (stream, data) {

	var date = new Date(),
		day = ('0' + date.getDate()).substr(-2),
		hours = ('0' + date.getHours()).substr(-2),
		minutes = ('0' + date.getMinutes()).substr(-2),
		month = ('0' + (date.getMonth() + 1)).substr(-2),
		seconds = ('0' + date.getSeconds()).substr(-2),
		that = this,
		year = date.getFullYear();

	// Make stream optional
	if (arguments.length < 2) {
		data = stream;
		stream = null;
	}

	// Stringify non-string data
	if (Buffer.isBuffer(data)) {
		data = data.toString();
	} else if (typeof data !== 'string') {
		data = JSON.stringify(data);

		// Check for undefined data
		if (!data) {
			data = '';
		}
	}

	// Replace defined tokens
	data = data.replace(/%date\b/g, date.toString());
	data = data.replace(/%day\b/g, day);
	data = data.replace(/%host\b/g, this.host);
	data = data.replace(/%hour\b/g, hours);
	data = data.replace(/%ip\b/g, this.ip);
	data = data.replace(/%lang\b/g, this.lang());
	data = data.replace(/%method\b/g, this.method);
	data = data.replace(/%minute\b/g, minutes);
	data = data.replace(/%month\b/g, month);
	data = data.replace(/%path\b/g, this.path);
	data = data.replace(/%protocol\b/g, this.protocol);
	data = data.replace(/%second\b/g, seconds);
	data = data.replace(/%short-date\b/g, day + '.' + month + '.' + year);
	data = data.replace(/%short-time\b/g, hours + ':' + minutes);
	data = data.replace(/%status\b/g, this.status());
	data = data.replace(/%time\b/g, hours + ':' + minutes + ':' + seconds);
	data = data.replace(/%timestamp\b/g, date.valueOf());
	data = data.replace(/%type\b/g, this.type());
	data = data.replace(/%year\b/g, year);

	// Replace request headers
	data = data.replace(/%req\[([^\]]+)\]\b/g, function (match, p1) {
		return that.request.headers[p1];
	});

	// Replace response headers
	data = data.replace(/%res\[([^\]]+)\]\b/g, function (match, p1) {
		return that.response.getHeader(p1);
	});

	// Check if the stream is defined
	if (stream && stream.writable) {
		stream.write(data + '\n');
	} else {
		console.log(data);
	}

	return this;
};

module.exports = connection;