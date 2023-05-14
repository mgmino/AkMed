//AkMed mqtt client - Adatek (ada)
//poll Adatek I/O

const SerialPort= require('serialport');	//npmjs.com/package/serialport
const ByteLength= require('@serialport/parser-byte-length');
const os = require('os');
const cfg = require('./config_ada');
const lib = require('./mqtt-client-lib');

const Log = new lib.Logger(cfg.logFile); //open log file

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
      console.log('Adatek error on open: ', err.message);
	  process.exit();
    }
  });
const parser= chan.pipe(new ByteLength({length: 1}))

chan.on('open', () => {
  console.log(`Adatek: open ${chan.path} @ ${chan.baudRate} baud, 7 bits, parity: odd`);
});

chan.on('close', () => {
  console.log('Adatek: serial port closed');
});

// Write serial data
function sendSerial(chars) {
	chan.write(chars, (err) => {
		if (err) return console.log('Adatek error on serial write: ', err.message);
	});
}

// Read serial data
let datum= null; //Adatek poll response
let lastHour= [99, 99]; //force report
let lastDatum= ['', ''];
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
			if (lastHour[idx] != now.getHours() || (datum != lastDatum[idx])) { //next hour or input change
				let logEntry= lib.timeCode(now); //init log entry with time stamp
				if (idx == 1 && (lastHour[1] > now.getHours())) { //trigger at start of each day
					pollCount= rspCount= 0; //restart polling and response counters
				}
				logEntry+= datum.charAt(0); //add Local/Remote type character
				datum.substr(1).trim().split('  ').forEach(num => logEntry+= '\t' +parseInt(num).toString(16));
				if (datum != lastDatum[idx]) inputChange(logEntry, idx);
				else Log.write('', logEntry);
		  		lastHour[idx] = now.getHours();
				lastDatum[idx]= datum;
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
			Log.write(`#poll(${pollCount}) <> response(${rspCount})`, timeStamp);
		if (!pollError) MQ.pub(timeStamp, 'conn', 'alert'); //only report once
		pollError= true;
	} else if (pollError) { //poll response after previous error
		MQ.pub(0, 'conn', 'ready');
		pollError= false;
	}
	if (pollCount++ % 2) //read Local i/o (24 points)
		sendSerial('A=#FD20:B=A+1:C=A+2:@A=0:@B=0:PRINT"[",@A,@B,@C,"]":@C=NOT(@COR1)+1\r');
	else //read Remote i/o (24 points)
		sendSerial('A=#FD40:B=A+1:C=A+2:@A=0:@B=0:PRINT"<",@A,@B,@C,"]":G=C-32:@G=NOT(@GOR1)\r');
//	@A=NOT(@AOR1)+(@AAND1) toggle output bit 0
}

function inputChange(timeStamp, idx) {
	let prevInputs= currInputs= 0;
	let change= 0xffffff; //report all inputs on startup
	datum.substr(1).trim().split('  ').forEach(num => currInputs= (currInputs << 8) +parseInt(num));
	if (lastDatum[idx] != '') { //after initialization
		lastDatum[idx].substr(1).trim().split('  ').forEach(num => prevInputs= (prevInputs << 8) +parseInt(num));
		change= prevInputs ^ currInputs;
	}
	Log.write('', timeStamp);
	if (idx) { //Remote idx=1
//		code to process remote I/O
	} else { //Local idx=0
		if (change & (1 << 16)) //mailbox
			MQ.pub(timeStamp, 'tell/mfd/ext/mailbox', currInputs & (1 << 16) ? 'open' : 'closed');
		if (change & ((1 << 18) | (1 << 17))) { //garage entry door
			const doorOpen= currInputs & (1 << 17); //garage entry door open
			if (currInputs & (1 << 18)) //garage entry door locked
				MQ.pub(timeStamp, 'tell/mfd/gar/entryDor', doorOpen ? 'alert' : 'locked');
			else //garage entry door unlocked
				MQ.pub(timeStamp, 'tell/mfd/gar/entryDor', doorOpen ? 'open' : 'closed');
		}
		// 19 unassigned
		if (change & (1 << 22)) //fan
			MQ.pub(timeStamp, 'tell/mfd/hvac/fan', currInputs & (1 << 22) ? 'off' : 'on');
		if (change & (1 << 23)) //condensate pump
			MQ.pub(timeStamp, 'tell/mfd/hvac/pump', currInputs & (1 << 23) ? 'off' : 'on');
		if (change & ((1 << 21) | (1 << 20))) { //hvac mode (heat/cool)
			const cooloff= currInputs & (1 << 21); //cool mode off
			if (currInputs & (1 << 20)) //heat mode off
				MQ.pub(timeStamp, 'tell/mfd/hvac/mode', cooloff ? 'off' : 'cool');
			else //heat mode on
				MQ.pub(timeStamp, 'tell/mfd/hvac/mode', cooloff ? 'heat' : 'alert');
		}
		if (change & ((1 << 8) | (1 << 9))) { //LAM garage door
			const doorup= currInputs & (1 << 8); //doorup
			if (currInputs & (1 << 9)) //doordn
				MQ.pub(logInfo, 'tell/mfd/gar/LAMdor', doorup ? 'mid' : 'up');
			else //heat mode on [5:A4]
				MQ.pub(logInfo, 'tell/mfd/gar/LAMdor', doorup ? 'down' : 'alert');
		}
	}
}

// open mqtt connection
const MQ= new lib.MQtt(cfg.mqttUrl, cfg.clientID);

MQ.client.on('connect', () => {	
	MQ.pub(0, 'conn', 'ready');
	setInterval(scanAdatek, 1000);
})

MQ.client.subscribe(cfg.clientID +'/get/#',{qos:1});

MQ.client.on('message',(topic, payload) => {
	if (topic == cfg.clientID +'/get/dev') MQ.pub(0, 'told/dev', 'mfd/gar/entryDor,mfd/ext/mailbox',1,false);
	else if (topic == cfg.clientID +'/get/loc') MQ.pub(0, 'told/loc', os.hostname(),1,false);
//	else if (topic == cfg.clientID +'/get/mfd/gar/entryDor/var') MQ.pub(0, 'told/${cfg.loc}/mfd/gar/entryDor/var', '??',1,false);
	else Log.write(`# Unknown message: ${topic} ${payload}`);
});
