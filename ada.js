//AkMed mqtt client - Adatek (ada)
//poll Adatek I/O

const SerialPort= require('serialport');	//npmjs.com/package/serialport
const ByteLength= require('@serialport/parser-byte-length');
const fileHandle= require('fs');
const mqtt = require('mqtt'); //npmjs.com/package/mqtt
const lib = require('./mqtt-client-lib');

// create and open serial port
const chan= new SerialPort('/dev/ttyUSB1', { baudRate: 4800, dataBits: 7, parity: odd, stopBits: 2 }, (err) => {
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
const logFile= fileHandle.createWriteStream(`/var/akmed/logs/ada.txt`, { flags: 'a' });
let datum= null;
let lastHour= [99, 99];
let lastDatum= ['', ''];
let pollCount= rspCount= 0;; //polling and response counters
parser.on('data', char => {
  if (char == '[') datum= 'L'; //start of local response
  else if (char == '<') datum= 'R'; //start of remote response
  else if (datum != null) { //processing a response
	  if (char == '"') datum= null; //ignore echo of request
	  else if (char == ']') { //end of response
			rspCount= pollCount;
			const clk= new Date();
			const idx= datum.charAt(0) == 'L' ? 0 : 1;
			if (lastHour[idx] != clk.getHours() || (datum != lastDatum[idx])) { //next hour or input change
				let timeStamp= lib.timeCode(clk);
				if (idx == 1 && (lastHour[1] > clk.getHours())) { //trigger at start of each day
					logFile.write(`${timeStamp}=${clk.toISOString('en-US')}\n`); //ISO date stamp 2020-10-09T14:48:00.000Z
					pollCount= rspCount= 0; //restart polling and response counters
				}
				timeStamp+= datum.charAt(0); //add Local/Remote type character
				datum.substr(1).trim().split('  ').forEach(num => timeStamp+= '\t' +parseInt(num).toString(16));
				if (datum != lastDatum[timeStamp, idx]) inputChange(timeStamp, idx);
				else logFile.write(`${timeStamp}\n`);
		  		lastHour[idx] = clk.getHours();
				lastDatum[idx]= datum;
			}
			datum= null;
	  } else datum+= char; //response text between [ and ]
  }
  if (argV.echo) process.stdout.write(char);
});

// POWR-TRAK System 73 core is National Semiconductor INS8073 running NSC Tiny Basic 
// input buffer size 72 characters
let pollError= false;
function scanAdatek() {
	if (pollCount != rspCount) { //no response from last poll
		const timeStamp= lib.timeCode();
		const missedPolls= pollCount -rspCount; //# missed poll responses
		if (missedPolls < 5 | !(missedPolls % 25)) //log initial faults and samples
			logFile.write(`${timeStamp}#poll(${pollCount}) <> response(${rspCount})\n`);
		if (!pollError) publish(timeStamp, 'ada/conn', 'alert'); //only report once
		pollError= true;
	} else if (pollError) { //poll response after previous error
		publish(lib.timeCode(), 'ada/conn', 'ready');
		pollError= false;
	}
	if (pollCount++ % 2) //read Local i/o (24 points)
		sendSerial('A=#FD20:B=A+1:C=A+2:@A=0:@B=0:PRINT"[",@A,@B,@C,"]":@C=NOT(@COR1)+1\r');
	else //read Remote i/o (24 points)
		sendSerial('A=#FD40:B=A+1:C=A+2:@A=0:@B=0:PRINT"<",@A,@B,@C,"]":G=C-32:@G=NOT(@GOR1)\r');
//	@A=NOT(@AOR1)+(@AAND1) toggle output bit 0
}

function publish(timeStamp, topic, payload='', qos=1, retain=true) {
	if (client.connected) {
		client.publish(topic, payload, {retain:retain, qos:qos}, err => {
			if (err) logFile.write(`${timeStamp}#${topic} ${payload} PUBLISH ERROR ${err}\n`);
			return;
		});
		logFile.write(`${timeStamp}::${topic} ${payload}\n`);
	} else
		logFile.write(`${timeStamp}#${topic} ${payload} DISCONNECT ERROR\n`);
}

function inputChange(timeStamp, idx) {
	let prevInputs= currInputs= 0;
	let change= 0xffffff; //report all inputs on startup
	datum.substr(1).trim().split('  ').forEach(num => currInputs= (currInputs << 8) +parseInt(num));
	if (lastDatum[idx] != '') { //after initialization
		lastDatum[idx].substr(1).trim().split('  ').forEach(num => prevInputs= (prevInputs << 8) +parseInt(num));
		change= prevInputs ^ currInputs;
	}
	if (idx) { //Remote idx=1
		logFile.write(`${timeStamp}\n`);
	} else { //Local idx=0
		if (change & (1 << 16)) //mailbox
			publish(timeStamp, 'ada/tell/mfld/ext/mailbox', currInputs & (1 << 16) ? 'open' : 'closed');
		if (change & ((1 << 18) | (1 << 17))) { //garage entry door
			const doorOpen= currInputs & (1 << 17); //garage entry door open
			if (currInputs & (1 << 18)) //garage entry door locked
				publish(timeStamp, 'ada/tell/mfld/gar/entryDor', doorOpen ? 'alert' : 'locked');
			else //garage entry door unlocked
				publish(timeStamp, 'ada/tell/mfld/gar/entryDor', doorOpen ? 'open' : 'closed');
		}
	}
}

// open mqtt connection
//const client= mqtt.connect('mqtt://localhost',{clientId:'ada',username: 'ada',password: 'pass'});
const client= mqtt.connect('mqtt://localhost',{clientId:'ada',will:{topic: 'ada/conn',payload: 'lost', qos: 1, retain: true}});

client.on('connect', () => {	
	publish(lib.timeCode(), 'ada/conn', 'ready');
	setInterval(scanAdatek, 1000);
})

client.on('error', err => {
	logFile.write(`${lib.timeCode()}# mqtt connect ${err}\n`);
	process.exit(1);
});

client.subscribe('ada/get/#',{qos:1});

client.on('message',(topic, payload, packet) => {
	if (topic == 'ada/get/dev') publish(lib.timeCode(), 'ada/told/dev', 'mfld/gar/entryDor,mfld/ext/mailbox',1,false);
	else if (topic == 'ada/get/loc') publish(lib.timeCode(), 'ada/told/loc', '192.168.1.13',1,false);
	else logFile.write(`Unknown message: ${topic} ${payload}\n`);
});
