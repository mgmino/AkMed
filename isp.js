//AkMed mqtt client - ISP Speed Test (isp)
//measure ping, upload, and download data transfer speed

const speedTest = require('speedtest-net');
const os = require('node:os');
const cfg = require('./config_isp');
const lib = require('./mqtt-client-lib');

const TWENTY_MINUTES = 20 * 60 * 1000;
const Log = new lib.Logger(cfg.logFile); //open log file
let lastIP = '', lastHour = 99;
const startTime= Date.now(); //ms since 1970-01-01

function doSpeedTest() {
	speedTest({ acceptLicense: true })
		.then(({ download, upload, ping, interface }) => {
			const now= new Date();
			const timeStamp= lib.timeCode(now);
			const newDay= (lastHour > now.getHours()); //trigger for next day
			lastHour = now.getHours();
			if (newDay) {
//				Log.write(`=${now.toISOString('en-US')}`, timeStamp); //ISO date stamp 2020-10-09T14:48:00.000Z
				Log.write(`a:\tping_latency[b64,ms]:download_time[b64,sec]:upload_time[b64,sec]\tdownload_speed[dec,kBps]\tupload_speed[dec,kBps]`, timeStamp); //define the a record type
				Log.write(`b:\texternal IP[str]`, timeStamp); //define the b record type
			}
			if (newDay || (lastIP != interface.externalIp)) { //report external IP each day and when it changes
				Log.write(`b\t${interface.externalIp}`, timeStamp);
				lastIP = interface.externalIp;
			}
			const up = Math.round(upload.bytes / upload.elapsed); //kBytes/sec
			const down = Math.round(download.bytes / download.elapsed); //kBytes/sec
			const tim = String.fromCharCode(lib.toBase64(ping.latency), lib.toBase64(download.elapsed / 1000), lib.toBase64(upload.elapsed / 1000)); //ms:sec:sec
			MQ.pub(`/tell/${cfg.loc}/isptst/ping`, `${tim} ms`);
			MQ.pub(`/tell/${cfg.loc}/isptst/upload`, `${up} kB/sec`);
			MQ.pub(`/tell/${cfg.loc}/isptst/dnload`, `${down} kB/sec`);
			Log.write(`a\t${tim}\t${down}\t${up}`, timeStamp);
			// console.log(`${timeStamp}a\t${interface.externalIp}\t${tim}\t${down}\t${up}`);
		})
		.catch ((err) => {
			Log.write('doSpeedTest error: ' +err.message, timeStamp);
			throw err;
		});
}

// open mqtt connection
const MQ= new lib.MQtt(cfg.mqttUrl, cfg.clientID, Log.write);

MQ.client.on('connect', () => {	
	MQ.pub('/conn', 'ready');
	doSpeedTest();
	setInterval(doSpeedTest, TWENTY_MINUTES);
})

MQ.client.subscribe(cfg.clientID +'/get/#',{qos:1});

MQ.client.on('message',(topic, message) => {
	if (topic == cfg.clientID +'/get/dev') MQ.pub('/told/dev', cfg.loc +'/isptst',1,false);
	else if (topic == cfg.clientID +'/get/uptime') MQ.pub('/told/uptime', ((Date.now() -startTime) /24 /3600000).toFixed(2),1,false);
	else if (topic == cfg.clientID +'/get/loc') MQ.pub('/told/loc', os.hostname(),1,false);
	else if (topic == cfg.clientID +'/get/test') doSpeedTest();
	else if (topic == `${cfg.clientID}/get/${cfg.loc}/isptst/var`) MQ.pub(`/told/${cfg.loc}/isptst/var`, 'ping,upload,dnload',1,false);
	else Log.write(`# Unknown message: ${topic} ${payload}`);
});
