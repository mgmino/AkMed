//AkMed mqtt client - Log (log)
//log all mqtt messages to monthly log file

const os = require('os');
const cfg = require('./config_log');
const lib = require('./mqtt-client-lib');

const Log = new lib.Logger(cfg.logFile, true); //open log file rotating each month

// open mqtt connection
const MQ= new lib.MQtt(cfg.mqttUrl, cfg.clientID);

MQ.client.on('connect', () => {	
	MQ.pub(0, 'conn', 'ready');
})

MQ.client.subscribe('#',{qos:1});

MQ.client.on('message',(topic, payload) => {
	if (topic == cfg.clientID +'/get/dev') MQ.pub(0, 'told/dev', 'none',1,false);
	else if (topic == cfg.clientID +'/get/loc') MQ.pub(0, 'told/loc', os.hostname(),1,false);
	else Log.write(`: ${topic} ${payload}`);
});