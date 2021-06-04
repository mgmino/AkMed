//AkMed mqtt client - Heating/Ventilation (hv1)
//poll Honeywell Radio Thermostat CT50

const got = require('got'); //https://www.npmjs.com/package/got
const os = require('os');
const cfg = require('./config_hv1');
const lib = require('./mqtt-client-lib');

const MINUTE = 60 * 1000; //60 * 1000ms
const Log = new lib.Logger(cfg.logFile);
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

let lastTemp = lastTmode= lastFmode= lastOverride= lastHold= lastTstat= lastFstat= lastTcool= lastTheat= 99;
const Tmode= ['off', 'heat', 'cool', 'auto']; //HVAC mode
const Fmode= ['auto', 'circ', 'on']; //fan mode
const Xmode= ['disabled', 'enabled']; //override and hold
const Smode= ['off', 'on']; //fan status
function pollCT50() { //request thermostat status (tstat)
	got.get(cfg.CT50Url+'/tstat', {responseType: 'json'})
	.then(tstat => {
//		console.log('Status Code:', tstat.statusCode);
		const now= new Date();
		const timeStamp= lib.timeCode(now);
		if (lastHour != now.getHours()) { //report each hour
			if (lastHour > now.getHours()) //report each day
				Log.write(`=${now.toISOString('en-US')}`, timeStamp); //ISO date stamp 2020-10-09T14:48:00.000Z
			Log.write(`:tstat ${JSON.stringify(tstat.body)}`, timeStamp);
			lastHour= now.getHours();
		}
		if (lastTemp != tstat.body.temp) {//temperature (degrees Fahrenheit)
			MQ.pub(timeStamp, `tell/${cfg.loc}/CT50/temp`, tstat.body.temp +' F');
			lastTemp= tstat.body.temp;
		}
		if (lastTmode != tstat.body.tmode) {//HVAC mode
			MQ.pub(timeStamp, `tell/${cfg.loc}/CT50/tmode`, Tmode[tstat.body.tmode]);
			lastTmode= tstat.body.tmode;
		}
		if (lastFmode != tstat.body.fmode) {//fan mode
			MQ.pub(timeStamp, `tell/${cfg.loc}/CT50/fmode`, Fmode[tstat.body.fmode]);
			lastFmode= tstat.body.fmode;
		}
		if (lastOverride != tstat.body.override) {//override
			MQ.pub(timeStamp, `tell/${cfg.loc}/CT50/override`, Xmode[tstat.body.override]);
			lastOverride= tstat.body.override;
		}
		if (lastHold != tstat.body.hold) {//hold
			MQ.pub(timeStamp, `tell/${cfg.loc}/CT50/hold`, Xmode[tstat.body.hold]);
			lastHold= tstat.body.hold;
		}
		if (lastTstat != tstat.body.tstate) {//HVAC Operating State
			MQ.pub(timeStamp, `tell/${cfg.loc}/CT50/mode`, Tmode[tstat.body.tstate]);
			lastTstat= tstat.body.tstate;
		}
		if (lastFstat != tstat.body.fstate) {//Fan Operating State
			MQ.pub(timeStamp, `tell/${cfg.loc}/CT50/fan`, Smode[tstat.body.fstate]);
			lastFstat= tstat.body.fstate;
		}
		if (lastTcool != tstat.body.t_cool) {//target Cool setpoint (degrees Fahrenheit)
			if (tstat.body.t_cool !== undefined)
				MQ.pub(timeStamp, `tell/${cfg.loc}/CT50/cool`, tstat.body.t_cool+' F');
			lastTcool= tstat.body.t_cool; 
		}
		if (lastTheat != tstat.body.t_heat ) {//target Heat setpoint (degrees Fahrenheit)
			if (tstat.body.t_heat !== undefined)
				MQ.pub(timeStamp, `tell/${cfg.loc}/CT50/heat`, tstat.body.t_heat+' F');
			lastTheat= tstat.body.t_heat; 
		}
	})
	.catch(err => {
		console.log('Got tstat Error: ', err.message);
	});	
}

async function sysCT50() { //request thermostat system information (sys)
	try {
		const sys= await got.get(cfg.CT50Url+'/sys', {responseType: 'text'});
		const model= await got.get(cfg.CT50Url+'/tstat/model', {responseType: 'text'});
		const sysName= await got.get(cfg.CT50Url+'/sys/name', {responseType: 'text'});

		const timeStamp= lib.timeCode(new Date());
		const response= sysName.body.slice(0, -1) +',' +model.body.slice(1, -1) +',' +sys.body.substr(1);
		Log.write(`:sys ${response}`, timeStamp);
		MQ.pub(timeStamp, `told/${cfg.loc}/CT50/sys`, response, 1, false);
	} catch (err) {
		console.log('Got sys Error: ', err.message);
	}
}

function setCT50(prop, val) { //request to change property (set)
	console.log(prop, val);
	if (prop == 'fmode') { //fan mode
		const fmodeVal= Fmode.indexOf(val);
		if (fmodeVal > -1 && fmodeVal < 3)
			postCT50('tstat', `{ "fmode":${fmodeVal} }`);
		else
			MQ.pub(0, `sat/${cfg.loc}/CT50`, `ERR: setCT50 ${prop} ${val}`,1,false);
	} else if (prop == 'tmode') { //HVAC mode
		const tmodeVal= Tmode.indexOf(val);
		if (tmodeVal > -1 && tmodeVal < 4)
			postCT50('tstat', `{ "tmode":${tmodeVal} }`);
		else
			MQ.pub(0, `sat/${cfg.loc}/CT50`, `ERR: setCT50 ${prop} ${val}`,1,false);
	} else if (prop == 'cool') { //target Cool setpoint (degrees Fahrenheit)
		postCT50('tstat', `{ "t_cool":${val} }`)
	} else if (prop == 'heat') { //target Heat setpoint (degrees Fahrenheit)
		postCT50('tstat', `{ "t_heat":${val} }`)
	} else
		MQ.pub(0, `sat/${cfg.loc}/CT50`, `Unknown: ${prop}~${val}`,1,false);
}

async function postCT50(url, data) {
	const response= await got(url, {
		prefixUrl: cfg.CT50Url,
		body: data,
		method: 'post',
		timeout: 300 //ms
	})
	MQ.pub(0, `sat/${cfg.loc}/CT50`, `Status: ${response.statusCode} ${data}`,1,false);
	pollCT50(); //read changed value(s)
}

function netCT50() { //request thermostat network information (net)
	got.get(cfg.CT50Url+'/sys/network', {responseType: 'text'})
	.then(net => {
		const timeStamp= lib.timeCode(new Date());
		Log.write(`:net ${net.body}`, timeStamp);
		MQ.pub(timeStamp, `told/${cfg.loc}/CT50/net`, net.body, 1, false);
	})
	.catch(err => {
		console.log('Got net Error: ', err.message);
	});	
}


// open mqtt connection
const MQ= new lib.MQtt(cfg.mqttUrl, cfg.clientID);
const MQclient= MQ.MQclient;

MQclient.on('connect', () => {	
	MQ.pub(0, 'conn', 'ready');
	pollCT50();
	setInterval(pollCT50, MINUTE);
});

MQclient.subscribe(`${cfg.clientID}/get/#`,{qos:1});
MQclient.subscribe(`${cfg.clientID}/set/#`,{qos:1});

MQclient.on('message',(topic, payload) => {
//	console.log(topic, payload.toString());
	if (topic == `${cfg.clientID}/get/dev`) MQ.pub(0, `told/dev`, `${cfg.loc}/CT50`,1,false);
	else if (topic == `${cfg.clientID}/get/loc`) MQ.pub(0, `told/loc`, os.hostname(),1,false);
	else if (topic == `${cfg.clientID}/get/${cfg.loc}/CT50/var`) MQ.pub(0, `told/${cfg.loc}/CT50/var`, 'temp,tmode,fmode,override,hold,tstate,fstate,t_cool,t_heat;sys,net;tmode,fmode,heat,cool',1,false);
	else if (topic == `${cfg.clientID}/get/${cfg.loc}/CT50/sys`) sysCT50();
	else if (topic == `${cfg.clientID}/get/${cfg.loc}/CT50/net`) netCT50();
	else if (topic.substr(0, 18) == `${cfg.clientID}/set/${cfg.loc}/CT50/`) setCT50(topic.substr(18), payload.toString());
	else Log.write(`# Unknown message: ${topic} ${payload}`);
});
