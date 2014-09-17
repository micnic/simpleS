'use strict';

var events = require('events'),
	stream = require('stream');

var multipartParser = function(type) {

	var boundary = '',
		match = type.match(/boundary=(?:"([^"]+)"|([^;]+))/i);

	// Call events.EventEmitter in this context
	events.EventEmitter.call(this);

	// Select the content boundary
	if (match) {
		if (match[1]) {
			boundary = match[1];
		} else if (match[2]) {
			boundary = match[2];
		}
		this.state = 0;
	} else {
		this.emit('error', new Error('No boundary found for multipart parser'));
		this.state = -1;
	}

	// Prepare parser members
	this.bindex = 2;
	this.boundary = new Buffer('\r\n--' + boundary);
	this.blength = this.boundary.length;
	this.buffer = [];
	this.field = null;
	this.pindex = 0;
	this.prev = 0;
	this.sindex = 0;
};

// Field prototype constructor
multipartParser.field = function (title) {

	// Call stream.PassThrough in this context
	stream.PassThrough.call(this);

	// Prepare field members
	this.name = title[1];
	this.headers = {};

	// Check for file upload
	if (title[2]) {
		this.filename = title[2];
		this.type = null;
	}
};

// Inherit from stream.PassThrough
multipartParser.field.prototype = Object.create(stream.PassThrough.prototype, {
	constructor: {
		value: multipartParser.field
	}
});

// Inherit from events.EventEmitter
multipartParser.prototype = Object.create(events.EventEmitter.prototype, {
	constructor: {
		value: multipartParser
	}
});

// Add last chunk of data, reset parser members and set next state
multipartParser.prototype.endPartData = function(data, state) {
	this.field.end(data);
	this.field = null;
	this.prev = 0;
	this.bindex = 0;
	this.state = state;
	this.pindex = 0;
};

// Get chunks of data
multipartParser.prototype.getData = function(data, index, current) {

	// Select the data from the beggining
	if (index === 0) {
		this.pindex = 0;
	}

	// Filter boundary bytes
	if (current === this.boundary[this.bindex]) {
		if (this.bindex === 0) {
			this.sindex = index;
		}
		this.bindex++;
	} else if (this.bindex === this.blength) {
		if (current === 13) {
			this.prev = 13;
			this.bindex++;
		} else if (current === 45) {
			this.prev = 45;
			this.bindex++;
		} else {
			this.emit('error', new Error('Unexpected boundary symbol found'));
			this.state = -1;
		}
	} else if (this.bindex > this.blength) {
		if (current === 10 && this.prev === 13) {
			this.endPartData(data.slice(this.pindex, this.sindex), 1);
		} else if (current === 45 && this.prev === 45) {
			this.endPartData(data.slice(this.pindex, this.sindex), 4);
		} else {
			this.emit('error', new Error('Unexpected boundary symbol found'));
			this.state = -1;
		}
	} else if (index === data.length - 1) {
		this.field.write(data.slice(this.pindex));
		this.pindex = 0;
	} else if (this.bindex !== 0 && current === this.boundary[0]) {
		this.sindex = index;
		this.bindex = 1;
	}
};

// Get header name and value for a field
multipartParser.prototype.getHeader = function(index, current) {
	if (current === 13) {
		this.prev = 13;
	} else if (current === 10 && this.prev === 13) {
		if (this.buffer.length) {
			this.parseHeader();
		} else {
			this.state = 2;
			this.pindex = index + 1;
			this.emit('field', this.field);
		}
	} else {
		this.buffer.push(current);
	}
};

// Validate request end
multipartParser.prototype.getRequestEnd = function(current) {
	if (current === 13 && this.prev === 0) {
		this.prev = 13;
	} else if (current !== 10 && this.prev !== 13) {
		this.emit('error', new Error('Invalid multipart request ending'));
		this.state = -1;
	}
};

// Create a new part based on content disposition
multipartParser.prototype.newPart = function(disposition) {

	var title = disposition.match(/^form-data; name="([^"]+)"(?:; filename="(.*?)")?$/i);

	// Check for a valid disposition and create a new field
	if (title) {
		this.field = new multipartParser.field(title);
	} else {
		this.emit('error', new Error('Invalid content disposition structure'));
		this.state = -1;
	}
};

// Extract header name and value from header definition
multipartParser.prototype.parseHeader = function() {

	var field = this.field,
		index = this.buffer.indexOf(58),
		header = String.fromCharCode.apply(String, this.buffer.slice(0, index)),
		value = String.fromCharCode.apply(String, this.buffer.slice(index + 1));

	// Remove possible redundant whitespace
	header = header.trim();
	value = value.trim();

	// Reset buffer
	this.buffer = [];

	// Check if colon found and get the header name and value
	if (index > 0) {
		if (!field && header === 'Content-Disposition') {
			this.newPart(value);
		} else if (field && field.filename && header === 'Content-Type') {
			field.type = value;
		} else if (field) {
			field.headers[header] = value;
		} else {
			this.state = -1;
		}
	} else {
		this.emit('error', new Error('No header name delimiter found'));
		this.state = -1;
	}
};

// Skip the beginning of the multipart data
multipartParser.prototype.skipFirstBoundary = function(current) {
	if (current === this.boundary[this.bindex]) {
		this.bindex++;
	} else if (this.bindex === this.blength && current === 13) {
		this.prev = 13;
		this.bindex++;
	} else if (this.bindex > this.blength && current === 10 && this.prev === 13) {
		this.bindex = 0;
		this.prev = 0;
		this.state = 1;
	} else {
		this.emit('error', new Error('Unexpected boundary symbol found'));
		this.state = -1;
	}
};

// Write data to the parser and parse it
multipartParser.prototype.write = function(data) {

	var current = data[0],
		index = 0;

	// Loop throught all received bytes
	while (current !== undefined) {

		// Stop parsing if the request is invalid
		if (this.state === -1) {
			break;
		}

		// Parse data
		if (this.state === 0) {
			this.skipFirstBoundary(current);
		} else if (this.state === 1) {
			this.getHeader(index, current);
		} else if (this.state === 2) {
			this.getData(data, index, current);
		} else if (this.state === 3) {
			this.getRequestEnd(current);
		}

		// Get next byte
		index++;
		current = data[index];
	}
};

// End parsing data
multipartParser.prototype.end = function() {
	this.emit('end');
};

module.exports = multipartParser;