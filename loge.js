//AkMed mqtt client - Log (log)
//log all mqtt messages to monthly log file

const os= require('os');
const mysql= require('mysql2');
const emsg= require('nodemailer');	//npm install nodemailer
const cfg= require('./config_log');
const lib= require('./mqtt-client-lib');

// open log file rotating each month
const Log = new lib.Logger(cfg.logFile, true);

// open mySQL connection
const DB= mysql.createConnection({
  host: 'localhost',
  user: cfg.user,
  password: cfg.password,
  database: 'akmed'
});

// open email connection
let transporter= emsg.createTransport({
//	service: 'gmail',
  host: 'mail.99wyatt.com',
//  port: 587,
  port: 465,
  secure: true, // true for 465, false for other ports
  auth: {
    user: cfg.euser,
    pass: cfg.epwd
  }
});

DB.connect(function(err) {
  if (err) throw err;
  Log.write(': database akmed connected');



transporter.sendMail({
    from: '"Akmed 👻" <foo@example.com>', // sender address
//    to: "8646308081@tmomail.net", // list of receivers
    to: "mgmoble@gmail.com", // list of receivers
    subject: "Status ✔", // Subject line
    text: "✔ Akmed Status" // plain text body
//    html: "<b>Hello world?</b>", // html body
  }, (error, info) => {
	if (error) {
    console.log(error);
  } else {
    console.log('Email sent: ' + info.response);
  }
});


// open mqtt connection
/*
  const MQ= new lib.MQtt(cfg.mqttUrl, cfg.clientID);
  MQ.client.on('connect', () => {	
	MQ.pub(0, 'conn', 'ready');
  })

  MQ.client.subscribe('#',{qos:1});

  MQ.client.on('message',(topic, msg) => { //mqtt message received
	if (topic == cfg.clientID +'/get/dev') MQ.pub(0, 'told/dev', 'none',1,false);
	else if (topic == cfg.clientID +'/get/loc') MQ.pub(0, 'told/loc', os.hostname(),1,false);
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
*/
})

//		SELECT FROM_UNIXTIME(timstamp), FROM_UNIXTIME(timstamp,"%Y-%m-%d") FROM mqtt
