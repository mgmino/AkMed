//EVent Advocate (eva)
//text/email daily events
const os= require('node:os');
const dbe= require('mysql');
const mailer= require('nodemailer');
const cfg= require('./inc/config_eva');
const lib= require('./mqtt-client-lib');

const ONEDAY= 24 * 60 * 60 * 1000;
const SQL = "SELECT fname, lname, tags, type, event, if(year(event),year(now())-year(event), ' ') AS age \
FROM (SELECT pid, fname, lname, tags, 'B' as type, born as event FROM people WHERE born > 0 UNION \
SELECT p.pid, if(i.type in ('wed','died'), fname,substr(info,1,locate(' ',info))), \
if(i.type in ('wed','died'), lname,substr(info,locate(' ',info)+1,locate(';',info)-locate(' ',info)-1)), \
tags, i.type, if(right(info,1) = ']',substr(info,-11,10),substr(info,-10)) as event \
FROM people AS p, pinfo as i WHERE i.info regexp '[0-2][0-9]{3}\-[0-9]{2}\-[0-9]{2}' AND p.pid = i.pid) AS d \
	WHERE month(event) = ";
const Log= new lib.Logger(cfg.clientID); //open log file
const startTime= Date.now(); //ms since 1970-01-01

const mailConn= mailer.createTransport({
	host: 'smtp.ionos.com',
	port: 587,
	tls: {
        rejectUnauthorized: true,
        minVersion: "TLSv1.2"
    },
	auth: {
		  user: cfg.mailuser,
		  pass: cfg.mailpword
		}
  });

function getEvents() {
	Object.keys(Conns).forEach(key => { //status of handlers
		if (Conns[key] == 'ready') 	MQ.pub(key +'/get/uptime');
		else Uptimes[key] = 'n/a';
	});
	const dbConn = dbe.createConnection( { //connect with mySQL
		host: cfg.dbhost,
		user: cfg.dbuser,
		password: cfg.dbpword,
		database: cfg.db
	});
	dbConn.connect((err) => {
		if (err) {
			Log.write('# getEvents mysql connection error: ' +err.message);
			MQ.pub('/told/events', 'err:connect',1,false);
			return;
		};
		const myDate= new Date();
		const todayStr= myDate.toLocaleDateString();
		myDate.setDate(myDate.getDate() +1); //increment to next day
		const mo= myDate.getMonth() +1; //zero based
		const day= myDate.getDate(); //events for next day
		dbConn.query(SQL +mo +' and day(event) = ' +day +' ORDER BY lname', (err, result, fields) => {
			if (err) {
				Log.write('# getEvents Query error: ' +err.message);
				MQ.pub('/told/events', 'err:query',1,false);
				return;
			};
//			console.log(result);
			let msg= '<h2>' +todayStr +' -- events for tomorrow</h2><table>';
			result.forEach(itm => {
				msg+= '<tr><td>' +itm.fname +' ' +itm.lname +'</td><td>' +itm.type +itm.age +'</td><td>' +itm.tags +"</td></tr>\n";
			});
			msg+= '</table>';
			msg+= os.hostname() +';  ' +os.platform() +';  ' +os.release() +';  ' +(os.uptime() /24 /3600).toFixed(2) +" days<br />\n"
//			console.log(msg);
			dbConn.destroy(); //disconnect from mySQL
			msg+= '<table>';
			Object.keys(Conns).forEach(key => { //status of handler
			//	Conns.splice(Conns.indexOf(key), 1); //remove item
				if (key.slice(0, 3) != 'mon')
					msg+= '<tr style="background-color:#ddf"><td>' +key +'</td><td>' +Uptimes[key] +"</td></tr>\n";
			});
			msg+= '</table>';
			const mailParm= {
				from: 'AkMed@ventureguide.net',
				to: 'mgmoble@gmail.com',
//				to: '8646307343@tmomail.net',
				subject: 'MgM Events',
				html: msg
			}
			mailConn.sendMail(mailParm, (err, info) => {
				if (err) {
					Log.write('# sendMail: ' +err.message);
					MQ.pub('/told/events', 'err:mail',1,false);
					return;
				};
//				console.log('Email sent: ' +info.response);
				Log.write(msg +info.response);
			});
		});
	});
}

// open mqtt connection
const MQ= new lib.MQtt(cfg.mqttUrl, cfg.clientID, Log.write.bind(Log));
MQ.client.on('connect', () => {	
	MQ.pub('/conn', 'ready');
	Log.write(`: ${cfg.clientID} connected to MQTT broker`);
	MQ.client.subscribe(cfg.clientID +'/get/#',{qos:1});
	MQ.client.subscribe('+/conn',{qos:1}); //listen for connection status
	MQ.client.subscribe('+/told/uptime',{qos:1}); //listen for uptime reports

	let time1= new Date(); //current time
	time1.setHours(21); //adjust to 9pm
	let firstDelay = time1.setMinutes(0).valueOf() -Date.now();
	if (firstDelay < 0) {
		firstDelay+= ONEDAY; //correct if past scheduled time
		getEvents(); //get today's events (which is tomorrow's)
	}
	setTimeout(() => {
		getEvents();
		setInterval(getEvents, ONEDAY);
	}, firstDelay);
})

let Conns= {eva:"ready"};
let Uptimes= {eva:"empty"};
MQ.client.on('message',(topic, payload) => {
	if (topic == cfg.clientID +'/get/dev') MQ.pub('/told/dev', 'events',1,false);
	else if (topic == cfg.clientID +'/get/uptime') MQ.pub('/told/uptime', ((Date.now() -startTime) /24 /3600000).toFixed(2)+' days',1,false );
	else if (topic == cfg.clientID +'/get/loc') MQ.pub('/told/loc', os.hostname() +'; ' +os.platform() +'; ' +os.release() +'; ' +(os.uptime() /24 /3600).toFixed(2) +' os days; ' +((Date.now() -startTime) /24 /3600000).toFixed(2)+' app days',1,false);
	else if (topic == cfg.clientID +'/get/events') getEvents();
	else if (topic.slice(-5) == '/conn') Conns[topic.slice(0,-5)] = payload.toString(); //client status
	else if (topic.slice(-12) == '/told/uptime') Uptimes[topic.slice(0,-12)] = payload.toString(); //client uptime
	else Log.write(`? Unknown message: ${topic} ${payload}`);
});