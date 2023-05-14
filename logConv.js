//AkMed log converter - logConv
//convert log entries to mySQL records

const fs= require('fs')
const mysql= require('mysql');

function fromBase64(num) { // convert from base64
	if (num < 58) return num - 48; // convert from ASCII 0 to 9
	else if (num < 91) return num - 65; // convert to ASCII A to Z
	else if (num < 125) return num - 97; // convert to ASCII a to z, {, |
	return -1; // error
}
function fromTimeCode(tim) { // convert from base64 timecode
	[hour, minute, second]= tim.split('');
	if (num < 10) return num + 48; // convert to ASCII 0 to 9
	else if (num < 36) return num + 55; // convert to ASCII A to Z
	else if (num < 64) return num + 61; // convert to ASCII a to z, {, |
	return 63; // ASCII question mark
}charCodeAt(0)

// open mySQL connection
const DB= mysql.createConnection({
  host: 'localhost',
  user: 'mqttuser',
  password: '0PABMW5mTiTr2cno',
  database: 'akmed'
});

DB.connect(function(err) {
  if (err) throw err;
  console.log(': database akmed connected');
});

const readInterface= readline.createInterface({
    input: fs.createReadStream('/var/akmed/logs/l0g-mqtt-2107.txt'),
    output: process.stdout,
    console: false
});

readInterface.on('line', function(line) {
    const [timecode, topic, payload, extra]= line.split(' ');
	let tim= fromBase64(timecode.substr(0,3));
		let delim= topic.indexOf('/');
		let delim2= topic.lastIndexOf('/');
		let client= topic.substr(0, delim);
		let subload= topic.substring(delim+1, delim2);
		let device= topic.substr(delim2+1, 99);
		let delim= payload.indexOf(' ');
		if (delim == -1) {//only metric, no info
			let metric= payload;
			let info= '';
		} else {
			let metric= payload.substr(0, delim);
			let info= payload.substr(delim+1, 99);
		}
		let sql= `INSERT INTO mqtt ('event', 'client', 'payload', 'device', 'metric', 'info', 'duration') VALUES ('${client}', '${subload}', '${device}', '${metric}', '${info}', '${duration}')`;
		DB.query(sql, function (err, result) {
			if (err) throw err;
			console.log("Result: " + result);
		});
	});
});