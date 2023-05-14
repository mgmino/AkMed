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
				datum.substr(1).trim().split('  ').forEach(elem => logEntry+= '\t' +parseInt(elem).toString(16)); //convert to hex for log
				Log.write('', logEntry);
				if (datum != lastDatum[idx]) { //input change
					inputChange(logEntry, idx);
					lastDatum[idx]= datum;
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
			Log.write(`#poll(${pollCount}) <> response(${rspCount})`, timeStamp);
		if (!pollError) MQ.pub(timeStamp, 'conn', 'alert'); //only report once
		pollError= true;
	} else if (pollError) { //poll response after previous error
		MQ.pub(0, 'conn', 'ready');
		pollError= false;
	}
	if (pollCount++ % 2) //read Local i/o (24 points) A:#FD20, B:#FD21, C:#FD22
		sendSerial('A=#FD20:B=A+1:C=A+2:@A=0:@B=0:PRINT"[",@A,@B,@C,"]":@C=NOT(@COR1)+1\r');
	else //read Remote i/o (24 points) A:#FD40, B:#FD41, C:#FD42
		sendSerial('A=#FD40:B=A+1:C=A+2:@A=0:@B=0:PRINT"<",@A,@B,@C,"]":G=C-32:@G=NOT(@GOR1)\r');
//	@A=NOT(@AOR1)+(@AAND1) toggle output bit 0
}

function inputChange(logInfo, idx) {
	let prevInputs= currInputs= 0;
	datum.substr(1).trim().split('  ').forEach(elem => currInputs= (currInputs << 8) +parseInt(elem));
	// 22222111  11111110  00000000
	// 43210987  65432109  87654321 - Adatek ID
	//C76543210 B76543210 A76543210 - Adatek port location
	//  A         B         C
	//  7654321  07654321  076543210 - currInputs
	if (lastDatum[idx] != '') { //after initialization
		lastDatum[idx].substr(1).trim().split('  ').forEach(elem => prevInputs= (prevInputs << 8) +parseInt(elem));
		const change= prevInputs ^ currInputs; //0:no change, 1:change in related I/O bit
	} else
		const change= 0xffffff; //report all inputs on startup
	if (idx) { //Remote idx=1
//		code to process remote I/O
	} else { //Local idx=0
		if (change & (1 << 16)) //mailbox closed [1:A0]
			MQ.pub(logInfo, 'tell/mfd/ext/mailbox', currInputs & (1 << 16) ? 'open' : 'closed');
		if (change & ((1 << 18) | (1 << 17))) { //garage entry door closed [2:A1]
			const doorOpen= currInputs & (1 << 17); //garage entry door open
			if (currInputs & (1 << 18)) //garage entry door locked
				MQ.pub(logInfo, 'tell/mfd/gar/entryDor', doorOpen ? 'alert' : 'locked');
			else //garage entry door unlocked [3:A2]
				MQ.pub(logInfo, 'tell/mfd/gar/entryDor', doorOpen ? 'open' : 'closed');
		}
		// 19 unassigned (4:A3)
		if (change & (1 << 22)) //fan on [7:A6]
			MQ.pub(logInfo, 'tell/mfd/hvac/fan', currInputs & (1 << 22) ? 'off' : 'on');
		if (change & (1 << 23)) //condensate pump on [8:A7]
			MQ.pub(logInfo, 'tell/mfd/hvac/pump', currInputs & (1 << 23) ? 'off' : 'on');
		if (change & ((1 << 21) | (1 << 20))) { //hvac mode (heat/cool)
			const cooloff= currInputs & (1 << 21); //cool mode on [6:A5]
			if (currInputs & (1 << 20)) //heat mode off
				MQ.pub(logInfo, 'tell/mfd/hvac/mode', cooloff ? 'off' : 'cool');
			else //heat mode on [5:A4]
				MQ.pub(logInfo, 'tell/mfd/hvac/mode', cooloff ? 'heat' : 'alert');
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
