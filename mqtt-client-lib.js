//function library for AkMed mqtt clients
//
const fs = require('node:fs'); //https://nodejs.org/api/fs.html
const mqtt = require('mqtt'); //https://www.npmjs.com/package/mqtt#store
const path= require('node:path');

class Logger { //append message to logfile
	constructor(clientID, rotate= false) {
		if (!rotate) this.logFile = createStream(clientID); //static filename
		this.rotate= rotate; //rotate file each month
		this.clientID= clientID;
		this.lastHour= 99; //force log date on startup
		this.lastMonth= 99; //force open of log file
	}
	write(msg, timeStamp= 0) { //default timeStamp is current time
		const now= new Date();
		if (timeStamp == 0) timeStamp= timeCode(now); //base64 time stamp
		if (this.rotate && this.lastMonth != now.getMonth()) { //change log file each month
			//if (this.lastMonth != 99) this.logFile.close(); //close previous file if not first time
			this.lastMonth= now.getMonth();
			this.logFile= createStream(`${this.clientID}-${(now.getYear()-100)*100 +this.lastMonth +1}`);
		}
		if (this.lastHour > now.getHours()) { //log date each day
			this.logFile.write(`${timeCode(now)}=${now.toISOString('en-US')}\n`); //ISO date stamp 2020-10-09T14:48:00.000Z
		}
		this.lastHour= now.getHours();
		this.logFile.write(timeStamp +msg +'\n');
	}
};

class MQtt { //MQ telemetry transport
	constructor(url, clientID, logWrite=console.log) {
		this.logWrite= logWrite;
		this.url = url;
		this.clientID = clientID;
		this.client= mqtt.connect(url, {clientID, will:{topic: clientID +'/conn',payload: 'lost', qos: 1, retain: true}});
		this.client.on('error', err => {
			logWrite(`# mqtt connection error: ${err}`);
			throw err;
		});
	}
	pub(topic, payload='', qos=1, retain=true, timeStamp=0) {
		if (this.client.connected) {
			if (topic.slice(0,1) == '/') topic= this.clientID +topic; //add ID for relative references
			this.client.publish(`${topic}`, payload.toString(), {retain:retain, qos:qos}, err => {
				if (err) this.logWrite(`# ${topic} ${payload} PUBLISH ERROR ${err}`);
			});
		} else {
			this.logWrite(`# ${topic} ${payload} DISCONNECT ERROR`);
		}
	}
};

function createStream(filename) {
	const fullPath= path.resolve(__dirname, 'log', filename +'.txt');
	if (!fs.existsSync(fullPath)) fs.mkdirSync(path.dirname(fullPath), {recursive:true});
	return fs.createWriteStream(fullPath, { flags: 'a' });
}

function timeCode(now= new Date()) { // convert to base64 time stamp
	return String.fromCharCode(toBase64(now.getHours()), toBase64(now.getMinutes()), toBase64(now.getSeconds()));
}

function toBase64(num) { // convert to base64
	num = Math.round(num);
	if (num < 10) return num + 48; // convert to ASCII 0 to 9
	else if (num < 36) return num + 55; // convert to ASCII A to Z
	else if (num < 64) return num + 61; // convert to ASCII a to z, {, |
	return 63; // ASCII question mark
}

module.exports = {timeCode, toBase64, Logger, MQtt};