//function library for AkMed mqtt clients
//
const fileHandle = require('fs'); //https://nodejs.org/api/fs.html
const mqtt = require('mqtt'); //https://www.npmjs.com/package/mqtt#store

class Logger { //append message to logfile
	constructor(filename, mode= false) {
		if (mode) this.filename= filename; //rotate filename
		else this.logFile = fileHandle.createWriteStream(filename +'.txt', { flags: 'a' });
		this.mode= mode; //rotate file each month
		this.lastHour= 99; //force log date on startup
		this.lastMonth= 99; //force open of log file
	}
	write(msg, timeStamp= 0) {
		const now= new Date();
		if (timeStamp == 0) timeStamp= timeCode(now); //base64 time stamp
		if (this.mode && this.lastMonth != now.getMonth()) { //change log file each month
			//if (this.lastMonth != 99) this.logFile.close(); //close previous file if not first time
			this.lastMonth= now.getMonth();
			this.logFile= fileHandle.createWriteStream(`${this.filename}-${(now.getYear()-100)*100 +this.lastMonth +1}.txt`, { flags: 'a' });
		}
		if (this.lastHour > now.getHours()) { //log date each day
			this.logFile.write(`${timeCode(now)}=${now.toISOString('en-US')}\n`); //ISO date stamp 2020-10-09T14:48:00.000Z
		}
		this.lastHour= now.getHours();
		this.logFile.write(timeStamp +msg +'\n');
	}
};

class MQtt { //MQ telemetry transport
	constructor(url, clientID, log=console.log) {
		this.log= log;
		this.url = url;
		this.clientID = clientID;
		this.client= mqtt.connect(url, {clientID, will:{topic: clientID +'/conn',payload: 'lost', qos: 1, retain: true}});
		this.client.on('error', err => {
			this.log(`# mqtt connection error ${err}`);
			process.exit(1);
		});
	}
	pub(topic, payload='', qos=1, retain=true, timeStamp=0) {
		this.log(`# test ${topic} ${payload}`, timeStamp);
		if (this.client.connected) {
			if (topic.slice(0,1) == '/') topic= this.clientID +topic;
			this.client.publish(`${topic}`, payload.toString(), {retain:retain, qos:qos}, err => {
				if (err) this.log(`# ${topic} ${payload} PUBLISH ERROR ${err}`, timeStamp);
			});
		} else {
			this.log(`# ${topic} ${payload} DISCONNECT ERROR`, timeStamp);
		}
	}
};

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