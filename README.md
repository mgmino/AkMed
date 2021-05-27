The Akmed architecture which is implemented using microcontrollers with limited resources. Abbreviations defined in this document are used liberally to reduce memory requirements and communication time while maintaining a level of human readability. The mqtt protocol is the glue of this system implemented with a Mosquitto server and many clients written in javascript using the node runtime environment.

Definitions
-----------

**Device**: An instance of a physical piece of hardware is called a device. For example, a car, an Arduino/ESP8266 or a coffee machine.

**Node**: A device can expose multiple nodes. Nodes are independent or logically separable parts of a device. For example, a car might expose a wheels node, an engine node and a lights node.

**Property**: A node can have multiple properties. Properties represent basic characteristics of the node/device, often given as numbers or finite states. For example the wheels node might expose an angle property. The engine node might expose a speed, direction and temperature property. The lights node might expose an intensity and a color property. Properties can be retained and/or settable.

**Attribute**: Devices, nodes and properties have specific attributes characterizing them. Attributes are represented by topic identifier starting with $. The precise definition of attributes is important for the automatic discovery of devices. Attributes are typically requested by a get message and published as a told message.

**Payload**: The data part of a message with a format of value (integer, boolean, float), single enum, enum list, or json object. A **j** is appended to the function (statj, setj) to indicate a JSON object. A numeric value may be followed by a space and an alphanumeric string indicating the unit of measure otherwise a space is not permited.

### Topic Naming Convention

The format of the mqtt topic:

**clientID/function/_location/sublocation/device/\[node/\]property ..._**

Examples:

ada/tell/mld/gar/sidor

### ClientID

topic | $name
ada | Adatek I/O interface (1 second)
isp | ISP Speed Test (15 minute)
hv1 | CT50 Thermostat (1 minute)
log | record all mqtt messages
mon | Monitor all mqtt messages

### Function

topic | action | retained | example
tell | published based on time or event | yes | temperature sensor
told | published info from get request | no | discovery information
conn | published client connected status | yes | gateway, device
blip | published based on isolated event (one shot) | no | door bell (momentary events)
set | request to change property (update tell) | no | lamp, motor
get | request to read and publish property | no | HC-SR04 range
all | broadcast | yes | alert

### Location

A geographic location that can be associated with a latitude and a longitude ($geo).

topic | $name | $geo
mfld | mFeld | 34.86410,-82.30804
wcrk | wCrek | 34.75046,-83.02010

### Sublocation (room)

topic | $name | topic | $name | topic | $name
kit | kitchen | mst | master bedroom | ofc | office
gar | garage | bmm | Brandon bedroom | fam | family room
ext | exterior | rec | Recreation room | foy | foyer
gst | guest bedroom | din | dining room | dek | deck
elm | Erika bedroom | liv | living room

### $state

alert | \-5 | connected, but something is wrong, needs human intervention
lost | \-4 | unexpected disconnect (set by last will & testament)
disconnected | \-3 | published prior to clean disconnect
init | \-2 | connected to MQTT but not published all messages
sleep | \-1 | published prior to entering sleep state
ready | 0 | connected, finished setup

Payload JSON properties

label | descriptor | units
ts | time\_stamp | seconds since 1/1/2020
tc | last\_change

seconds since 1/1/2020

wn Demo