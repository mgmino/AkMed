//AkMed mqtt client - Log (log)
//log all mqtt messages to monthly log file

const fileHandle= require('fs'); //https://nodejs.org/api/fs.html
const mqtt= require('mqtt'); //https://www.npmjs.com/package/mqtt#store
const lib = require('./mqtt-client-lib');

function publish(topic, payload='', qos=1, retain=true) {
	if (client.connected) {
		client.publish(topic, payload, {retain:retain, qos:qos}, err => {
			if (err) logEntry(`#${topic} ${payload} PUBLISH ERROR ${err}`);
			return;
		});
		logEntry(`::${topic} ${payload}`);
	} else
		logEntry(`#${topic} ${payload} DISCONNECT ERROR`);
}

let lastMonth= 99; //force open of log file
let lastHour= 99; //force date stamp
let YrMo, logFile;

function logEntry(logItem) { // convert to base64 time stamp
	const clk= new Date();
	const timeStamp= lib.timeCode(clk);
	if (lastMonth != clk.getMonth()) {
	//	if (lastMonth != 99) logFile.close(); //close previous file if not first time
		lastMonth= clk.getMonth();
		YrMo= (clk.getYear()-100)*100 +lastMonth;
		logFile= fileHandle.createWriteStream(`/var/akmed/logs/log${YrMo}.txt`, { flags: 'a' });
	}
	if (lastHour > clk.getHours()) {
		logFile.write(`${timeStamp}=${clk.toISOString('en-US')}\n`); //ISO date stamp 2020-10-09T14:48:00.000Z
		lastHour= clk.getHours();
	}
	logFile.write(`${timeStamp}${logItem}\n`);
}

// open mqtt connection
const client= mqtt.connect('mqtt://localhost',{clientId:'log',will:{topic: 'log/conn',payload: 'lost', qos: 1, retain: true}});

client.on('connect', () => {	
	publish('log/conn', 'ready');
})

client.on('error', err => {
	logEntry(`# mqtt connect ${err}`);
	process.exit(1);
});

client.subscribe('#',{qos:1});

client.on('message',(topic, payload, packet) => {
	if (topic == 'log/get/dev') publish('log/told/dev', 'none', 1, false);
	else if (topic == 'log/get/loc') publish(timeCode(), 'log/told/loc', '192.168.1.13',1,false);
	else logEntry(`: ${topic} ${payload}`);
});
