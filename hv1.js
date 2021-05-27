//AkMed mqtt client - Heating/Ventilation (hv1)
//poll Honeywell Radio Thermostat CT50

const got = require('got'); //https://www.npmjs.com/package/got
const fileHandle = require('fs');
const mqtt = require('mqtt'); //https://www.npmjs.com/package/mqtt#store
const lib = require('./mqtt-client-lib');

const CT50IP = 'http://192.168.1.117';
const MINUTE = 60 * 1000; //60 * 1000ms
const logFile = fileHandle.createWriteStream('/var/akmed/logs/l0g-hv1.txt', { flags: 'a' });
let lastHour= 99;

//poll Honeywell Radio Thermostat CT50 v1.94 Thermostat (thermostat-FF-43-09)
//Device ID: 5cdad4ff4309; Authentication Key: 8d9979d8; API Version: 113; Firmware Version: 1.04.84
//tstat: {"temp":77.5,"tmode":0,"fmode":0,"override":0,"hold":1,"tstate":0,"fstate":0,"time":{"day":1,"hour":10,"minute":14},"t_type_post":0}
//tstat/hvac_settings: {"pump":1,"aux_type":2,"hvac_code":1}
//tstat/fan_ctime: {"fan_ctime":-1}
//sys: {"uuid":"5cdad4ff4309","api_version":113,"fw_version":"1.04.84","wlan_fw_version":"v10.105576"}
//sys/network: {"ssid":"Farrago~Omicron~eXotic~Net:2.4","bssid":"a0:8e:78:26:5d:2e","channel":11,"security":4,"ip":1,"rssi":-40}
//sys/services: {"service_names":["com.rtcoa.tstat:1.0","devices.controller.tstat:1.0"],"httpd_handlers":{"/tstat":[1,1],"/sys/network":[1,1],"/sys/updater":[0,1],"/sys/filesystem":[0,1],"/sys/fs-image":[0,1],"/sys/firmware":[1,1],"/sys/fw-image":[0,1],"/sys/command":[0,1],"/sys/services":[1,0],"/sys/mode":[1,1],"/sys/name":[1,1],"/sys/watchdog":[1,1],"/sys/diag/log":[1,0],"/sys/diag/stats/live":[1,0],"/sys/diag/stats/history":[1,0],"/cloud":[1,1]}} //[SUPPORTS_GET, SUPPORTS_POST] supported modes and API endpoints
//cloud: {"interval":300,"url":"http://my.radiothermostat.com/rtcoa/rest/rtcoa","status":1,"enabled":1,"authkey":"8d9979d8","status_code":200}
//https://github.com/brannondorsey/radio-thermostat

let lastTemp = lastTmode= lastFmode= lastOverride= lastHold= 99;
const Tmode= ['off', 'heat', 'cool', 'auto'];
const Fmode= ['auto', 'circ', 'on'];
const Xmode= ['disabled', 'enabled']; //override and hold
function pollCT50() { //request thermostat status (tstat)
	got.get(CT50IP+'/tstat', {responseType: 'json'})
	.then(tstat => {
//		console.log('Status Code:', tstat.statusCode);
		const clk= new Date();
		const timeStamp= lib.timeCode(clk);
		if (lastHour != clk.getHours()) { //report each hour
			if (lastHour > clk.getHours()) //report each day
				logFile.write(`${timeStamp}=${clk.toISOString('en-US')}\n`); //ISO date stamp 2020-10-09T14:48:00.000Z
			logFile.write(`${timeStamp}:tstat ${JSON.stringify(tstat.body)}\n`);
			lastHour= clk.getHours();
		}
		if (lastTemp != tstat.body.temp) {//temperature (degrees Fahrenheit)
			publish(timeStamp, 'hv1/tell/mfld/CT50/temp', tstat.body.temp);
			lastTemp= tstat.body.temp;
		}
		if (lastTmode != tstat.body.tmode) {//thermostat mode
			publish(timeStamp, 'hv1/tell/mfld/CT50/tmode', Tmode[tstat.body.tmode]);
			lastTmode= tstat.body.tmode;
		}
		if (lastFmode != tstat.body.fmode) {//fan mode
			publish(timeStamp, 'hv1/tell/mfld/CT50/fmode', Fmode[tstat.body.fmode]);
			lastFmode= tstat.body.fmode;
		}
		if (lastOverride != tstat.body.override) {//override
			publish(timeStamp, 'hv1/tell/mfld/CT50/override', Xmode[tstat.body.override]);
			lastOverride= tstat.body.override;
		}
		if (lastHold != tstat.body.hold) {//hold
			publish(timeStamp, 'hv1/tell/mfld/CT50/hold', Xmode[tstat.body.hold]);
			lastHold= tstat.body.hold;
		}
	})
	.catch(err => {
		console.log('Got tstat Error: ', err.message);
	});	
}

function sysCT50() { //request thermostat system information (sys)
	got.get(CT50IP+'/sys', {responseType: 'text'})
	.then(sys => {
		got.get(CT50IP+'/tstat/model', {responseType: 'text'})
		.then(model => {
			got.get(CT50IP+'/sys/name', {responseType: 'text'})
			.then(sysName => {
				const clk= new Date();
				const timeStamp= timeCode(clk);
				const response= sysName.body.slice(0, -1) +',' +model.body.slice(1, -1) +',' +sys.body.substr(1);
				logFile.write(`${timeStamp}:sys ${response}\n`);
				publish(timeStamp, 'hv1/told/mfld/CT50/sys', response, 1, false);
			});
		});
	})
	.catch(err => {
		console.log('Got sys Error: ', err.message);
	});	
}

function netCT50() { //request thermostat network information (net)
	got.get(CT50IP+'/sys/network', {responseType: 'text'})
	.then(net => {
		const clk= new Date();
		const timeStamp= timeCode(clk);
		logFile.write(`${timeStamp}:net ${net.body}\n`);
		publish(timeStamp, 'hv1/told/mfld/CT50/net', net.body, 1, false);
	})
	.catch(err => {
		console.log('Got net Error: ', err.message);
	});	
}

function publish(timeStamp, topic, payload, qos=1, retain=true) {
	if (client.connected)
		client.publish(topic, payload.toString(), {retain:retain, qos:qos}, err => {
			if (err) logFile.write(`${timeStamp}: ${topic} ${payload} PUBLISH ERROR ${err}\n`);
		});
	else
		logFile.write(`${timeStamp}: ${topic} ${payload} DISCONNECT ERROR\n`);
}

// open mqtt connection
const client= mqtt.connect('mqtt://localhost',{clientId:'hv1',will:{topic: 'hv1/conn',payload: 'lost', qos: 1, retain: true}});

client.on('connect', () => {	
	publish(lib.timeCode(), 'hv1/conn', 'ready');
	pollCT50();
	setInterval(pollCT50, MINUTE);
})

client.on('error', err => {
	logFile.write(`mqtt connection error ${err}\n`);
	process.exit(1);
});

client.subscribe('hv1/get/#',{qos:1});

client.on('message',(topic, message, packet) => {
	if (topic == 'hv1/get/dev') publish(lib.timeCode(), 'hv1/told/dev', 'mfld/CT50',1,false);
	else if (topic == 'hv1/get/loc') publish(lib.timeCode(), 'hv1/told/loc', '192.168.1.13',1,false);
	else if (topic == 'hv1/get/mfld/CT50/var') publish(lib.timeCode(), 'hv1/told/mfld/CT50/var', 'temp,tmode,fmode,override,hold;sys,net',1,false);
	else if (topic == 'hv1/get/mfld/CT50/sys') sysCT50();
	else if (topic == 'hv1/get/mfld/CT50/net') netCT50();
	else logFile.write(`Unknown message: ${topic} ${msg} ${packet}\n`);
});