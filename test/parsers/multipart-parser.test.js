'use strict';

const tap = require('tap');

const MultipartParser = require('simples/lib/parsers/multipart-parser');
const MultipartField = require('simples/lib/parsers/multipart-field');
const { PassThrough, Transform } = require('stream');

const { states: {
	expectData,
	expectFirstBoundary,
	expectHeader,
	expectRequestEnd,
	parsingFailed,
	parsingFinished
} } = MultipartParser;

const boundary = '--------boundary';
const dispositionHeader = 'Content-Disposition';
const dispositionValue = 'form-data; name="name"; filename="filename"';
const filename = 'filename';
const header = `multipart/form-data; boundary=${boundary}`;
const name = 'name';

tap.test('MultipartParser.getBoundary()', (test) => {

	test.test('Empty header', (t) => {

		t.ok(MultipartParser.getBoundary('') === null);

		t.end();
	});

	test.test('Header provided', (t) => {

		t.ok(MultipartParser.getBoundary(header) === boundary);

		t.end();
	});

	test.test('Quoted boundary provided', (t) => {

		const quotedHeader = `multipart/form-data; boundary="${boundary}"`;

		t.ok(MultipartParser.getBoundary(quotedHeader) === boundary);

		t.end();
	});

	test.end();
});

tap.test('MultipartParser.prototype.constructor()', (test) => {

	test.test('Empty header', (t) => {

		try {
			new MultipartParser('');
		} catch (error) {
			t.ok(error instanceof Error);
		}

		t.end();
	});

	test.test('Full header', (t) => {

		const parser = new MultipartParser(boundary);

		t.ok(parser instanceof MultipartParser);
		t.ok(parser instanceof Transform);
		t.match(parser, {
			boundary: Buffer.from(`\r\n--${boundary}`),
			boundaryIndex: 2,
			boundaryLength: parser.boundary.length,
			buffer: Buffer.alloc(0),
			expect: expectFirstBoundary,
			field: null,
			header: '',
			prev: 0,
			startIndex: 0,
			stopIndex: 0
		});

		t.end();
	});

	test.end();
});

tap.test('MultipartParser.prototype.skipFirstBoundary()', (test) => {

	const data = Buffer.from(`--${boundary}\r\nHEADER`);
	const parser = new MultipartParser(boundary);
	const boundaryLength = boundary.length + 2;

	let index = 0;

	while (index < boundaryLength) {
		parser.skipFirstBoundary(data[index], () => {
			test.fail('Callback function should not be called');
		});

		test.ok(parser.boundaryIndex === index + 3);

		index++;
	}

	parser.skipFirstBoundary(data[index], () => {
		test.fail('Callback function should not be called');
	});

	test.ok(parser.prev === 13); // \r

	index++;

	parser.skipFirstBoundary(data[index], () => {
		test.fail('Callback function should not be called');
	});

	test.match(parser, {
		boundaryIndex: 0,
		expect: expectHeader,
		prev: 0
	});

	index++;

	parser.skipFirstBoundary(data[index], (error) => {
		test.ok(error instanceof Error);
		test.ok(parser.expect === parsingFailed);
	});

	test.end();
});

tap.test('MultipartParser.prototype.newPart()', (test) => {

	const parser = new MultipartParser(boundary);

	parser.newPart('form-data; name="name"', () => {
		test.fail('Callback function should not be called');
	});

	test.ok(parser.field instanceof MultipartField);
	test.ok(parser.field instanceof PassThrough);
	test.match(parser.field, {
		headers: {},
		name
	});

	parser.newPart(dispositionValue, () => {
		test.fail('Callback function should not be called');
	});

	test.ok(parser.field instanceof MultipartField);
	test.ok(parser.field instanceof PassThrough);
	test.match(parser.field, {
		filename,
		headers: {},
		name
	});

	parser.newPart('', (error) => {
		test.ok(error instanceof Error);
	});

	test.end();
});

tap.test('MultipartParser.prototype.parseHeader()', (test) => {

	test.test('With disposition', (t) => {

		const parser = new MultipartParser(boundary);

		parser.header = `${dispositionHeader}: ${dispositionValue}`;

		parser.parseHeader(() => {
			t.fail('Callback function should not be called');
		});

		t.ok(parser.field instanceof MultipartField);
		t.ok(parser.field instanceof PassThrough);
		t.match(parser, {
			field: {
				filename,
				headers: {
					[dispositionHeader.toLowerCase()]: dispositionValue
				},
				name
			},
			header: ''
		});

		t.end();
	});

	test.test('With header and field', (t) => {

		const parser = new MultipartParser(boundary);

		parser.field = new MultipartField(name);
		parser.header = 'Content-Type: text/plain';

		parser.parseHeader(() => {
			t.fail('Callback function should not be called');
		});

		t.match(parser.field.headers, {
			'content-type': 'text/plain'
		});
		t.ok(parser.header === '');

		t.end();
	});

	test.test('Without header', (t) => {

		const parser = new MultipartParser(boundary);

		parser.parseHeader((error) => {
			t.ok(error instanceof Error);
			t.ok(error.message === 'No header name delimiter found');
			t.ok(parser.expect === parsingFailed);
		});

		t.end();
	});

	test.test('With header only', (t) => {

		const parser = new MultipartParser(boundary);

		parser.field = null;
		parser.header = 'Content-Type: text/plain';

		parser.parseHeader((error) => {
			t.ok(error instanceof Error);
			t.ok(error.message === 'Invalid header received');
			t.ok(parser.expect === parsingFailed);
		});

		t.end();
	});

	test.end();
});

tap.test('MultipartParser.prototype.getHeader()', (test) => {

	const parser = new MultipartParser(boundary);
	const data = Buffer.from('H: V\r\n\r\n');

	let index = 0;

	parser.header = `${dispositionHeader}: ${dispositionValue}`;

	parser.parseHeader(() => {
		test.fail('Callback function should not be called');
	});

	parser.getHeader(data[index], index, () => {
		test.fail('Callback function should not be called');
	});

	test.ok(parser.header === 'H');

	// --------------------

	index++;

	parser.getHeader(data[index], index, () => {
		test.fail('Callback function should not be called');
	});

	test.ok(parser.header === 'H:');

	// --------------------

	index++;

	parser.getHeader(data[index], index, () => {
		test.fail('Callback function should not be called');
	});

	test.ok(parser.header === 'H: ');

	// --------------------

	index++;

	parser.getHeader(data[index], index, () => {
		test.fail('Callback function should not be called');
	});

	// --------------------

	test.ok(parser.header === 'H: V');

	index++;

	// --------------------

	parser.getHeader(data[index], index, () => {
		test.fail('Callback function should not be called');
	});

	test.ok(parser.prev === data[index]);
	test.ok(parser.header === 'H: V');

	index++;

	// --------------------

	parser.getHeader(data[index], index, () => {
		test.fail('Callback function should not be called');
	});

	test.ok(parser.prev === 0);
	test.ok(parser.field.headers['h'] === 'V');

	index++;

	// --------------------

	parser.getHeader(data[index], index, () => {
		test.fail('Callback function should not be called');
	});

	test.ok(parser.prev === data[index]);

	index++;

	// --------------------

	parser.on('field', (field) => {
		test.match(parser, {
			expect: expectData,
			field,
			startIndex: index + 1,
			stopIndex: index + 1
		});
	});

	parser.getHeader(data[index], index, () => {
		test.fail('Callback function should not be called');
	});

	test.ok(parser.prev === 0);

	test.end();
});

tap.test('MultipartParser.prototype.endPartData()', (test) => {

	const data = Buffer.from('  data  ');
	const expect = Symbol('expect');
	const parser = new MultipartParser(boundary);

	parser.newPart('form-data; name="name"', () => {
		test.fail('Callback function should not be called');
	});

	parser.field.on('data', (data) => {
		test.ok(String(data) === 'data');
	});

	parser.startIndex = 2;
	parser.stopIndex = 6;

	parser.endPartData(data, expect);

	test.match(parser, {
		boundaryIndex: 0,
		field: null,
		prev: 0,
		startIndex: 0,
		stopIndex: 0
	});

	test.end();
});

tap.test('MultipartParser.prototype.getData()', (test) => {

	const parser = new MultipartParser(boundary);

	let data = Buffer.from(`data\r\n--${boundary}\r\n`);
	let index = 0;

	parser.boundaryIndex = 0;

	parser.newPart('form-data; name="name"', () => {
		test.fail('Callback function should not be called');
	});

	parser.field.on('data', (data) => {
		test.ok(String(data) === 'data');
	});

	while (index < 4) {
		parser.getData(data, data[index], index, () => {
			test.fail('Callback function should not be called');
		});

		test.match(parser, {
			boundaryIndex: 0,
			startIndex: 0,
			stopIndex: index
		});

		index++;
	}

	let end = index;

	while (index < data.length) {
		parser.getData(data, data[index], index, () => {
			test.fail('Callback function should not be called');
		});

		if (index === data.length - 1) {
			test.match(parser, {
				boundaryIndex: 0,
				startIndex: 0,
				stopIndex: 0
			});
		} else {
			test.match(parser, {
				boundaryIndex: index - 3,
				startIndex: 0,
				stopIndex: end
			});
		}

		index++;
	}

	test.ok(parser.expect === expectHeader);

	// --------------------

	data = Buffer.from(`data\r\n--${boundary}--`);
	index = end;

	parser.expect = expectData;

	parser.newPart('form-data; name="name"', () => {
		test.fail('Callback function should not be called');
	});

	parser.field.on('data', (data) => {
		test.ok(String(data) === 'data');
	});

	while (index < data.length) {
		parser.getData(data, data[index], index, () => {
			test.fail('Callback function should not be called');
		});

		if (index === data.length - 1) {
			test.match(parser, {
				boundaryIndex: 0,
				startIndex: 0,
				stopIndex: 0
			});
		} else {
			test.match(parser, {
				boundaryIndex: index - 3,
				startIndex: 0,
				stopIndex: end
			});
		}

		index++;
	}

	test.ok(parser.expect === expectRequestEnd);

	// --------------------

	data = Buffer.from(`data\r\n--${boundary}+`);
	index = end;

	parser.expect = expectData;

	parser.newPart('form-data; name="name"', () => {
		test.fail('Callback function should not be called');
	});

	while (index < data.length) {

		if (index === data.length - 1) {
			parser.getData(data, data[index], index, (error) => {
				test.ok(error instanceof Error);
			});
		} else {
			parser.getData(data, data[index], index, () => {
				test.fail('Callback function should not be called');
			});

			test.match(parser, {
				boundaryIndex: index - 3,
				startIndex: 0,
				stopIndex: end
			});
		}

		index++;
	}

	test.ok(parser.expect === parsingFailed);

	// --------------------

	data = Buffer.from(`data\r\n--${boundary}-+`);
	index = end;

	parser.boundaryIndex = 0;
	parser.expect = expectData;

	parser.newPart('form-data; name="name"', () => {
		test.fail('Callback function should not be called');
	});

	while (index < data.length) {

		if (index === data.length - 1) {
			parser.getData(data, data[index], index, (error) => {
				test.ok(error instanceof Error);
			});
		} else {
			parser.getData(data, data[index], index, () => {
				test.fail('Callback function should not be called');
			});

			test.match(parser, {
				boundaryIndex: index - 3,
				startIndex: 0,
				stopIndex: end
			});
		}

		index++;
	}

	test.ok(parser.expect === parsingFailed);

	// --------------------

	data = Buffer.from(`data\r\r\n--${boundary}--`);
	index = 0;

	parser.boundaryIndex = 1;
	parser.expect = expectData;
	parser.stopIndex = 0;

	parser.newPart('form-data; name="name"', () => {
		test.fail('Callback function should not be called');
	});

	parser.field.on('data', (data) => {
		if (data.length === 1) {
			test.ok(String(data) === '\r');
		} else {
			test.ok(String(data) === 'data\r');
		}
	});

	while (index < 5) {
		parser.getData(data, data[index], index, () => {
			test.fail('Callback function should not be called');
		});

		if (index === 4) {
			test.match(parser, {
				boundaryIndex: 1,
				startIndex: 0,
				stopIndex: index
			});
		} else {
			test.match(parser, {
				boundaryIndex: 0,
				startIndex: 0,
				stopIndex: index
			});
		}

		index++;
	}

	end = index;

	while (index < data.length) {

		if (index === data.length - 1) {
			parser.getData(data, data[index], index, (error) => {
				test.ok(error instanceof Error);
			});
		} else {
			parser.getData(data, data[index], index, () => {
				test.fail('Callback function should not be called');
			});

			test.match(parser, {
				boundaryIndex: index - 4,
				startIndex: 0,
				stopIndex: end
			});
		}

		index++;
	}

	test.ok(parser.expect === expectRequestEnd);

	// --------------------

	data = Buffer.from('data');
	index = 0;

	parser.expect = expectData;

	parser.newPart('form-data; name="name"', () => {
		test.fail('Callback function should not be called');
	});

	parser.field.on('data', (data) => {
		test.ok(String(data) === 'data');
	});

	while (index < 4) {
		parser.getData(data, data[index], index, () => {
			test.fail('Callback function should not be called');
		});

		test.match(parser, {
			boundaryIndex: 0,
			startIndex: 0
		});

		if (index === 3) {
			test.ok(parser.stopIndex === 0);
		} else {
			test.ok(parser.stopIndex === index);
		}

		index++;
	}

	test.end();
});

tap.test('MultipartParser.prototype.endParsing()', (test) => {

	const parser = new MultipartParser(boundary);
	const lineFeed = 10;
	const carriageReturn = 13;

	parser.endParsing(carriageReturn, () => {
		test.fail('Callback function should not be called');
	});

	test.ok(parser.prev === carriageReturn);

	// --------------------

	parser.endParsing(lineFeed, () => {
		test.fail('Callback function should not be called');
	});

	test.ok(parser.expect === parsingFinished);

	// --------------------

	parser.endParsing(0, (error) => {
		test.ok(error instanceof Error);
	});

	test.end();
});

tap.test('MultipartParser.prototype.parseByte()', (test) => {

	const byte = 0;
	const index = 1;
	const parser = new MultipartParser(boundary);
	const someBuffer = Buffer.alloc(0);
	const someCallback = () => {};

	parser.parseByte(someBuffer, byte, index, someCallback);

	// --------------------

	parser.expect = expectHeader;

	parser.parseByte(someBuffer, byte, index, someCallback);

	// --------------------

	parser.expect = expectData;

	parser.parseByte(someBuffer, byte, index, someCallback);

	// --------------------

	parser.expect = expectRequestEnd;

	parser.parseByte(someBuffer, byte, index, someCallback);

	// --------------------

	parser.expect = parsingFinished;

	parser.parseByte(someBuffer, byte, index, (error) => {
		test.ok(error instanceof Error);
	});

	test.end();
});

tap.test('MultipartParser.prototype.write()', (test) => {

	const byte = 45;
	const parser = new MultipartParser(boundary);

	parser.on('error', (error) => {
		test.ok(error instanceof Error);
	});

	parser.write(Buffer.from([byte]));

	// --------------------

	parser.write(Buffer.from([0]));

	test.end();
});

tap.test('MultipartParser.prototype.end()', (test) => {

	let parser = new MultipartParser(boundary);

	parser.expect = parsingFinished;

	parser.on('finish', () => {
		test.pass('Parsing ended');
	});

	parser.end();

	// --------------------

	parser = new MultipartParser(boundary);

	parser.on('error', (error) => {
		test.ok(error instanceof Error);
	});

	parser.on('finish', () => {
		test.pass('Parsing ended');
	});

	parser.end();

	test.end();
});