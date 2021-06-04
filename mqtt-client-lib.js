//function library for AkMed mqtt clients
//
const fileHandle = require('fs');
const mqtt = require('mqtt'); //https://www.npmjs.com/package/mqtt#store

class Logger {  // append message to logfile
	constructor(filename) {
		this.logFile = fileHandle.createWriteStream(filename, { flags: 'a' });
	}
	write(msg, timeStamp= timeCode()) {
		if (timeStamp == 0) timeStamp= timeCode();
		this.logFile.write(timeStamp +msg +'\n');
	}
};

class MQtt {  // MQ telemetry transport
	constructor(url, clientID) {
		this.url = url;
		this.clientID = clientID;
		this.client= mqtt.connect(url, {clientID, will:{topic: clientID +'/conn',payload: 'lost', qos: 1, retain: true}});
		this.client.on('error', err => {
			Log.write(`# mqtt connection error ${err}`);
			process.exit(1);
		});
	}
	get MQclient() {return this.client;}
	
	pub(timeStamp, topic, payload, qos=1, retain=true) {
		if (this.client.connected)
			this.client.publish(`${this.clientID}/${topic}`, payload.toString(), {retain:retain, qos:qos}, err => {
				if (err) Log.write(`# ${topic} ${payload} PUBLISH ERROR ${err}`, timeStamp);
			});
		else
			Log.write(`# ${topic} ${payload} DISCONNECT ERROR`, timeStamp);
	}
};

function timeCode(clk= new Date()) { // convert to base64 time stamp
	return String.fromCharCode(toBase64(clk.getHours()), toBase64(clk.getMinutes()), toBase64(clk.getSeconds()));
}

function toBase64(num) { // convert to base64
	num = Math.round(num);
	if (num < 10) return num + 48; // convert to ASCII 0 to 9
	else if (num < 36) return num + 55; // convert to ASCII A to Z
	else if (num < 64) return num + 61; // convert to ASCII a to z, {, |
	return 63; // ASCII question mark
}

module.exports = {timeCode, toBase64, Logger, MQtt};