//function library for AkMed mqtt clients
//

function timeCode(clk= new Date()) { // convert to base64 time stamp
	return String.fromCharCode(toBase64(clk.getHours()), toBase64(clk.getMinutes()), toBase64(clk.getSeconds()));
}

function toBase64(num) { // convert to base64
	num = Math.round(num);
	if (num < 10) return num + 48; // convert to ASCII 0 to 9
	else if (num < 36) return num + 55; // convert to ASCII A to Z
	else if (num < 64) return num + 61; // convert to ASCII a to z, {, |
	return 63; // ASCII question mark
}

module.exports = {timeCode, toBase64};