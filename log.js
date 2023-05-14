//AkMed mqtt client - Log (log)
//log all mqtt messages to monthly log file

const os= require('node:os');
const mysql= require('mysql2');
const cfg= require('./config_log');
const lib= require('./mqtt-client-lib');

// open log file rotating each month
const Log = new lib.Logger(cfg.logFile, true);
const startTime= Date.now(); //ms since 1970-01-01

// open mySQL connection
const DB= mysql.createConnection({
	host: 'localhost',
	user: cfg.user,
	password: cfg.password,
	database: 'akmed'
});

DB.connect(function(err) {
	if (err) throw err;
	Log.write(': database akmed connected');

// open mqtt connection
const MQ= new lib.MQtt(cfg.mqttUrl, cfg.clientID, Log.write);
MQ.client.on('connect', () => {	
	MQ.pub('/conn', 'ready');
})

MQ.client.subscribe('#',{qos:1});

MQ.client.on('message',(topic, msg) => {
	if (topic == cfg.clientID +'/get/dev') MQ.pub('/told/dev', 'none',1,false);
	else if (topic == cfg.clientID +'/get/uptime') MQ.pub('/told/uptime', ((Date.now() -startTime) /24 /3600000).toFixed(2),1,false);
	else if (topic == cfg.clientID +'/get/loc') MQ.pub('/told/loc', os.hostname(),1,false);
	else {
		const timstamp= Math.floor(Date.now() /1000); //convert ms to sec
		const topics= topic.split('/'); //extract client and device
		const msgs= (msg.toString()+' ').split(' '); //extract metric and meta
		// default topic record in database table ensures INSERT if SELECT fails (first time topic is encountered)
		let sql= `INSERT INTO mqtt (timstamp, topic, client, device, metric, meta, lastshift) SELECT ${timstamp}, '${topic}', '${topics.shift()}', '${topics.pop()}', '${msgs[0]}', '${msgs[1]}', ${timstamp}-timstamp FROM mqtt WHERE topic = '${topic}' OR topic = 'default' ORDER BY timstamp DESC LIMIT 1`;
		DB.query(sql, function (err, result) {
			if (err) Log.write(`: ${topic} ${msg.toString()} %%SQL ERROR%% ${err}; sql:${sql}`);
			Log.write(`: ${topic} ${msg.toString()} ${result.insertId}`);
		});
	};
  });
})
//		SELECT FROM_UNIXTIME(timstamp), FROM_UNIXTIME(timstamp,"%Y-%m-%d") FROM mqtt
