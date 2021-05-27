//AkMed mqtt client - Monitor (mon)
//display all mqtt message to console

const mqtt = require('mqtt'); //https://www.npmjs.com/package/mqtt#store
const lib = require('./mqtt-client-lib');

function publish(timeStamp, topic, payload, qos=1, retain=true) {
	if (client.connected)
		client.publish(topic, payload.toString(), {retain:retain, qos:qos}, err => {
			if (err) console.log(`#${timeStamp}: ${topic} ${payload} PUBLISH ERROR ${err}\n`);
		});
		console.log(`::${topic} ${payload}`);
	else
		console.log(`#${timeStamp}: ${topic} ${payload} DISCONNECT ERROR\n`);
}

// open mqtt connection
const client= mqtt.connect('mqtt://localhost',{clientId:'mon',will:{topic: 'mon/conn',payload: 'lost', qos: 1, retain: true}});

client.on('connect', () => {	
	publish(lib.timeCode(), 'mon/conn', 'ready');
})

client.on('error', err => {
	console.log(`mqtt connection error ${err}\n`);
	process.exit(1);
});

client.subscribe('#',{qos:1});

client.on('message',(topic, payload, packet) => {
	if (topic == 'mon/get/devices') publish(lib.timeCode(), 'mon/told/devices', 'none',1,false);
	else console.log(`${topic} ${payload}`);
});
