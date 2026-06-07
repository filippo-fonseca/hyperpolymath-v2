// jarvis-mic-prototype.ino
//
// DFRobot DF2301Q (Gravity Offline Voice Recognition, SEN0539) -> Arduino UNO R3.
// Wake-word ("Jarvis" if retrained via voice; default "Hello robot") + 121 fixed
// commands + 17 custom slots, all recognized on-device.
//
// I2C wiring (mode switch MUST be set to I2C on the module):
//   Module VCC -> UNO 5V
//   Module GND -> UNO GND
//   Module C/R -> UNO A5  (SCL)
//   Module D/T -> UNO A4  (SDA)
//
// Serial output (115200 baud), one line per recognized command:
//   ID=<n> NAME=<best-effort phrase>
//
// The Node bridge (tools/jarvis-physical/bridge/jarvis-serial-bridge.mjs)
// parses this line shape and POSTs to /api/jarvis/physical/trigger.
//
// Wake-word recognition itself does NOT print -- the module's onboard
// speaker confirms wake (chime / "I'm here"). Only post-wake recognized
// commands surface here. To use the wake-word itself as the trigger,
// the bridge can be configured to fire on ANY ID > 0.

#include <Wire.h>
#include "DFRobot_DF2301Q.h"

static const uint8_t  ASR_I2C_ADDR    = 0x64;
static const uint8_t  ASR_WAKE_TIME_S = 20;     // seconds the module stays awake after wake-word
static const uint32_t POLL_INTERVAL_MS = 100;   // CMDID poll cadence

DFRobot_DF2301Q_I2C asr;

// Minimal subset of the 121-command table -- extend as needed.
// Full list: https://wiki.dfrobot.com/SKU_SEN0539-EN_Gravity_Voice_Recognition_Module_I2C_UART#target_4
const char* commandName(uint8_t id) {
  switch (id) {
    case 1:   return "<wake word>";
    case 103: return "Turn on the light";
    case 104: return "Turn off the light";
    case 105: return "Brighten the light";
    case 106: return "Dim the light";
    case 109: return "Turn red";
    case 110: return "Turn orange";
    case 111: return "Turn yellow";
    case 112: return "Turn green";
    case 117: return "Turn blue";
    case 118: return "Turn purple";
    case 119: return "Turn white";
    default:  return "<unknown>";
  }
}

void setup() {
  Serial.begin(115200);
  while (!Serial) { /* wait for USB CDC */ }

  Wire.begin();
  Wire.setClock(100000); // 100 kHz I2C

  uint8_t retries = 0;
  while (!asr.begin(ASR_I2C_ADDR)) {
    Serial.println(F("DF2301Q not found -- check wiring + I2C mode switch."));
    delay(2000);
    if (++retries > 10) {
      Serial.println(F("Giving up on auto-detect, will keep polling in loop."));
      break;
    }
  }

  asr.setWakeTime(ASR_WAKE_TIME_S);
  Serial.print(F("DF2301Q ready. Wake time = "));
  Serial.print(ASR_WAKE_TIME_S);
  Serial.println(F("s."));
  Serial.println(F("Say the wake word, then a command."));
}

void loop() {
  const uint8_t id = asr.getCMDID();
  if (id != 0) {
    Serial.print(F("ID="));
    Serial.print(id);
    Serial.print(F(" NAME="));
    Serial.println(commandName(id));
  }
  delay(POLL_INTERVAL_MS);
}
