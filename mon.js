//AkMed mqtt client - Monitor (mon)
//display all mqtt messages on console

const os = require('os');
const cfg = require('./config_mon');
const lib = require('./mqtt-client-lib');

// open mqtt connection
const MQ= new lib.MQtt(cfg.mqttUrl, cfg.clientID);

MQ.client.on('connect', () => {	
	MQ.pub(0, 'conn', 'ready');
})

MQ.client.subscribe('#',{qos:1});

MQ.client.on('message',(topic, payload) => {
	if (topic == cfg.clientID +'/get/dev') MQ.pub(0, 'told/dev', 'none',1,false);
	else if (topic == cfg.clientID +'/get/loc') MQ.pub(0, 'told/loc', os.hostname(),1,false);
	else console.log(`${lib.timeCode()}: ${topic} ${payload}`);
});