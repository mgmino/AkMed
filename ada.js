//AkMed mqtt client - Adatek (ada)
//poll Adatek I/O

const SerialPort= require('serialport');	//npmjs.com/package/serialport
const ByteLength= require('@serialport/parser-byte-length');
const os = require('node:os');
const cfg = require('./inc/config_ada');
const lib = require('./mqtt-client-lib');

const Log= new lib.Logger(cfg.logFile); //open log file
const startTime= Date.now(); //ms since 1970-01-01

// list serial ports
console.log('Adatek: Available Serial Ports');
SerialPort.list().then(ports => {
  ports.forEach(function(port) {
	if (port.pnpId !== undefined) {
		console.log(port.path, 'ID:', port.pnpId, 'Mfr:', port.manufacturer,
		port.serialNumber ? 'serialNumber: ' +port.serialNumber : '',
		'vendorId:', port.vendorId, 'productId:', port.productId);
//		console.log(port);
	}
  });
})

// create and open serial port
const chan= new SerialPort('/dev/ttyUSB1', { baudRate: 4800, dataBits: 7, parity: 'odd', stopBits: 2 }, (err) => {
	if (err) {
		Log.write('# Adatek error on open: ' +err.message);
		throw err;
	}
});
const parser= chan.pipe(new ByteLength({length: 1}))

chan.on('open', () => {
	Log.write(`: open ${chan.path} @ ${chan.baudRate} baud, 7 bits, parity: odd`);
});

chan.on('close', () => {
	console.log('Adatek: serial port closed');
});

// Write serial data
function sendSerial(chars) {
	chan.write(chars, (err) => {
		if (err) Log.write('# Adatek error on serial write: ', err.message);
	});
}

// Read serial data
let datum= null; //Adatek poll response
const nowHour= new Date().getHours();
let lastHour= [nowHour, nowHour];
let currInputs, delta;
let lastInputs= [0x1000000, 0x1000000]; //report all I/O on startup (set b24)
let pollCount= rspCount= 0;; //polling and response counters
parser.on('data', char => {
	if (char == '[') datum= 'L'; //start of local response
	else if (char == '<') datum= 'R'; //start of remote response
	else if (datum != null) { //processing a response
		if (char == '"') datum= null; //ignore echo of request
		else if (char == ']') { //end of response
			rspCount= pollCount;
			const now= new Date();
			const idx= datum.charAt(0) == 'L' ? 0 : 1;
			currInputs= 0;
			datum.substr(1).trim().split('  ').forEach(elem => currInputs= (currInputs << 8) +parseInt(elem));
			if (lastHour[idx] != now.getHours() || (delta= (currInputs != lastInputs[idx]))) { //next hour or input change
				let logEntry= lib.timeCode(now); //init log entry with time stamp
				if (idx == 1 && (lastHour[1] > now.getHours())) { //trigger at start of each day
					pollCount= rspCount= 0; //restart polling and response counters
				}
				logEntry+= datum.charAt(0); //add Local/Remote type character
				logEntry+= delta ? '*' : ''; //indicate input change
				datum.substr(1).trim().split('  ').forEach(elem => logEntry+= '\t' +parseInt(elem).toString(16).padStart(2, '0')); //convert to hex for log
				Log.write(logEntry);
				if (delta) { //input change
					inputChange(logEntry, idx);
					lastInputs[idx]= currInputs;
				} else //next hour
					lastHour[idx]= now.getHours();
			}
			datum= null;
		} else datum+= char; //response text between [ and ]
	}
// process.stdout.write(char);
});

// POWR-TRAK System 73 core is National Semiconductor INS8073 running NSC Tiny Basic 
// input buffer size 72 characters
let pollError= false;
function scanAdatek() {
	if (pollCount != rspCount) { //no response from last poll
		const timeStamp= lib.timeCode();
		const missedPolls= pollCount -rspCount; //# missed poll responses
		if (missedPolls < 5 | !(missedPolls % 25)) //log initial faults and samples
			Log.write(`# poll(${pollCount}) <> response(${rspCount})`);
		if (!pollError) MQ.pub('/conn', 'alert'); //only report once
		pollError= true;
	} else if (pollError) { //poll response after previous error
		MQ.pub('/conn', 'ready');
		pollError= false;
	}
	if (pollCount++ % 2) //read Local i/o (24 points) A:#FD20, B:#FD21, C:#FD22
		sendSerial('A=#FD20:B=A+1:C=A+2:@A=0:@B=0:PRINT"[",@A,@B,@C,"]":@C=NOT(@COR1)+1\r');
	else //read Remote i/o (24 points) A:#FD40, B:#FD41, C:#FD42
		sendSerial('A=#FD40:B=A+1:C=A+2:@A=0:@B=0:PRINT"<",@A,@B,@C,"]":G=C-32:@G=NOT(@GOR1)\r');
//	@A=NOT(@AOR1)+(@AAND1) toggle output bit 0
}

function inputChange(logInfo, idx) {
	// 00000000  11111110  22222111
	// 87654321  65432109  43210987 - Adatek ID
	//A76543210 B76543210 C76543210 - Adatek port location
	// 22221111  11111100  00000000
	// 32109876  54321098  76543210 - currInputs bit (lastInputs, change)
	//currInputs:: 0:true, 1:false (inverted logic)
	//change:: 0:no change, 1:change in related I/O bit
	const change= lastInputs[idx] == 0x1000000 ? 0xffffff : lastInputs[idx] ^ currInputs;
	if (idx) { //Remote I/O idx=1
		//code to process remote I/O
	} else { //Local I/O idx=0
		if (change & (1 << 16)) //[1:A0:mailbox closed]
			MQ.pub('/tell/mfd/ext/mailbox', currInputs & (1 << 16) ? 'open' : 'closed',1,true,logInfo);
		if (change & ((1 << 17) | (1 << 18))) { //garage entry door
			const doorOpen= currInputs & (1 << 17); //[2:A1:door closed]
			if (currInputs & (1 << 18)) //[3:A2:door unlocked]
				MQ.pub('/tell/mfd/gar/entryDor', doorOpen ? 'alert' : 'locked',1,true,logInfo);
			else //door unlocked
				MQ.pub('/tell/mfd/gar/entryDor', doorOpen ? 'open' : 'closed',1,true,logInfo);
		}
		//[4:A3:unassigned]
		if (change & (1 << 22)) //[7:A6:fan on]
			MQ.pub('/tell/mfd/hvac/fan', currInputs & (1 << 22) ? 'off' : 'on',1,true,logInfo);
		if (change & (1 << 23)) //[8:A7:condensate pump on]
			MQ.pub('/tell/mfd/hvac/pump', currInputs & (1 << 23) ? 'off' : 'on',1,true,logInfo);
		if (change & ((1 << 20) | (1 << 21))) { //hvac mode (heat/cool)
			const cooloff= currInputs & (1 << 21); //[6:A5:cool mode on]
			if (currInputs & (1 << 20)) //[5:A4:heat mode on]
				MQ.pub('/tell/mfd/hvac/mode', cooloff ? 'off' : 'cool',1,true,logInfo);
			else //heat mode on
				MQ.pub('/tell/mfd/hvac/mode', cooloff ? 'heat' : 'alert',1,true,logInfo);
		}
		if (change & ((1 << 8) | (1 << 9))) { //LAM garage door
			const doorup= currInputs & (1 << 8); //[9:B0:door not down]
			if (currInputs & (1 << 9)) //[10:B1:door not up]
				MQ.pub('/tell/mfd/gar/LAMdor', doorup ? 'alert' : 'up',1,true,logInfo);
			else //door not up
				MQ.pub('/tell/mfd/gar/LAMdor', doorup ? 'down' : 'mid',1,true,logInfo);
		}
		if (change & ((1 << 10) | (1 << 11))) { //MgM garage door
			const doorup= currInputs & (1 << 10); //[11:B2:door not down]
			if (currInputs & (1 << 11)) //[12:B3:door not up]
				MQ.pub('/tell/mfd/gar/MgMdor', doorup ? 'alert' : 'up',1,true,logInfo);
			else //door not up
				MQ.pub('/tell/mfd/gar/MgMdor', doorup ? 'down' : 'mid',1,true,logInfo);
		}
	}
}

// open mqtt connection
const MQ= new lib.MQtt(cfg.mqttUrl, cfg.clientID, Log.write.bind(Log));
MQ.client.on('connect', () => {	
	MQ.pub('/conn', 'ready');
	Log.write(`: ${cfg.clientID} connected to MQTT broker`);
	MQ.client.subscribe(cfg.clientID +'/get/#',{qos:1});
	setInterval(scanAdatek, 1000); //scan each second
})

// answer mqtt requests
MQ.client.on('message',(topic, payload) => {
	if (topic == cfg.clientID +'/get/dev') MQ.pub('/told/dev', 'mfd/gar/entryDor,mfd/gar/MgMdor,mfd/gar/LAMdor,mfd/ext/mailbox,mfd/hvac',1,false);
	else if (topic == cfg.clientID +'/get/uptime') MQ.pub('/told/uptime', ((Date.now() -startTime) /24 /3600000).toFixed(2)+' days',1,false );
	else if (topic == cfg.clientID +'/get/loc') MQ.pub('/told/loc', os.hostname() +'; ' +os.platform() +'; ' +os.release() +'; ' +(os.uptime() /24 /3600).toFixed(2) +' os days; ' +((Date.now() -startTime) /24 /3600000).toFixed(2)+' app days',1,false);
//	else if (topic == cfg.clientID +'/get/mfd/gar/entryDor/var') MQ.pub('/told/${cfg.loc}/mfd/gar/entryDor/var', '??',1,false);
	else Log.write(`? Unknown message: ${topic} ${payload}`);
});
