//AkMed mqtt client - ISP Speed Test (isp)
//measure ping, upload, and download data transfer speed

const speedTest = require('speedtest-net');
const fileHandle = require('fs');
const mqtt = require('mqtt'); //https://www.npmjs.com/package/mqtt#store
const lib = require('./mqtt-client-lib');

const MINUTE = 60 * 1000; //60 * 1000ms
const FIFTEEN_MINUTES = 15 * MINUTE;
const logFile = fileHandle.createWriteStream('/var/akmed/logs/isp.txt', { flags: 'a' });
let lastIP = '', lastHour = 99;

function doSpeedTest() {
	speedTest({ acceptLicense: true })
		.then(({ download, upload, ping, interface }) => {
			const clk= new Date();
			const timeStamp= lib.timeCode(clk);
			const newDay= (lastHour > clk.getHours()); //trigger for next day
			lastHour = clk.getHours();
			if (newDay) {
				logFile.write(`${timeStamp}=${now.toISOString('en-US')}\n`); //ISO date stamp 2020-10-09T14:48:00.000Z
				logFile.write(`${timeStamp}a:\tping_latency[b64,ms]:download_time[b64,sec]:upload_time[b64,sec]\tdownload_speed[dec,kBps]\tupload_speed[dec,kBps]\n`); //define the a record type
				logFile.write(`${timeStamp}b:\texternal IP[str]\n`); //define the b record type
			}
			if (newDay || (lastIP != interface.externalIp)) { //report external IP each day and when it changes
				logFile.write(`${timeStamp}b\t${interface.externalIp}\n`);
				lastIP = interface.externalIp;
			}
			const up = Math.round(upload.bytes / upload.elapsed); //kBytes/sec
			const down = Math.round(download.bytes / download.elapsed); //kBytes/sec
			const tim = String.fromCharCode(toBase64(ping.latency), toBase64(download.elapsed / 1000), toBase64(upload.elapsed / 1000)); //ms:sec:sec
			publish(timeStamp, 'tell/mfld/sys/ping', `${tim} ms`);
			publish(timeStamp, 'tell/mfld/sys/upload', `${up} kB/sec`);
			publish(timeStamp, 'tell/mfld/sys/dnload', `${down} kB/sec`);
			logFile.write(`${timeStamp}a\t${tim}\t${down}\t${up}\n`);
			// console.log(`${timeStamp}a\t${interface.externalIp}\t${tim}\t${down}\t${up}`);
		})
		.catch(console.error);
}

function publish(timeStamp, topic, payload='', qos=1, retain=true) {
	if (client.connected)
		client.publish(topic, payload, {retain:retain, qos:qos}, err => {
			if (err) logFile.write(`${timeStamp}: ${topic} ${payload} PUBLISH ERROR ${err}\n`);
		});
	else
		logFile.write(`${timeStamp}: ${topic} ${payload} DISCONNECT ERROR\n`);
}

// open mqtt connection
const client= mqtt.connect('mqtt://localhost',{clientId:'isp',will:{topic: 'isp/conn',payload: 'lost', qos: 1, retain: true}});

client.on('connect', () => {	
	logFile.write(`mqtt connected\n`);
	publish(lib.timeCode(), 'isp/conn', 'ready');
	doSpeedTest();
	setInterval(doSpeedTest, FIFTEEN_MINUTES);
})

client.on('error', err => {
	logFile.write(`mqtt connection error ${err}\n`);
	process.exit(1);
});

client.subscribe('isp/get/#',{qos:1});

client.on('message',(topic, message, packet) => {
	if (topic == 'isp/get/dev') publish(lib.timeCode(), 'isp/told/dev', 'mfld/sys/ping,mfld/sys/upload,mfld/sys/dnload',1,false);
	else if (topic == 'isp/get/loc') publish(lib.timeCode(), 'isp/told/loc', '192.168.1.13',1,false);
	else logFile.write(`Unknown message: ${topic} ${msg} ${packet}\n`);
});
