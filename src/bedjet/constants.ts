// BedJet V3 BLE UUIDs (confirmed from ESPHome + pybedjet)
export const BEDJET3_SERVICE_UUID      = '00001000-bed0-0080-aa55-4265644a6574';
export const BEDJET3_STATUS_UUID       = '00002000-bed0-0080-aa55-4265644a6574';
export const BEDJET3_NAME_UUID         = '00002001-bed0-0080-aa55-4265644a6574';
export const BEDJET3_SSID_UUID         = '00002002-bed0-0080-aa55-4265644a6574';
export const BEDJET3_PASSWORD_UUID     = '00002003-bed0-0080-aa55-4265644a6574';
export const BEDJET3_COMMAND_UUID      = '00002004-bed0-0080-aa55-4265644a6574';
export const BEDJET3_BIODATA_UUID      = '00002005-bed0-0080-aa55-4265644a6574';
export const BEDJET3_BIODATA_FULL_UUID = '00002006-bed0-0080-aa55-4265644a6574';

// Discard notification packets that are not exactly this length
export const BEDJET3_NOTIFICATION_LENGTH = 20;
// Discard direct status reads that are not exactly this length
export const BEDJET3_STATUS_LENGTH       = 11;

export const DISCONNECT_DELAY_MS      = 60_000;
export const MAX_RECONNECT_ATTEMPTS   = 5;

// byte [9] of notification packet
export enum OperatingMode {
  STANDBY       = 0,
  HEAT          = 1,
  TURBO         = 2,
  EXTENDED_HEAT = 3,
  COOL          = 4,  // fan only — no compressor
  DRY           = 5,
  WAIT          = 6,  // pause step in a biorhythm program
}

// Write to BEDJET3_COMMAND_UUID as Buffer.from([command_byte, ...args])
export enum BedJetCommand {
  BUTTON          = 0x01,
  SET_RUNTIME     = 0x02,
  SET_TEMPERATURE = 0x03,
  SET_STEP        = 0x04,
  SET_HACKS       = 0x05,
  STATUS          = 0x06,
  SET_FAN         = 0x07,
  SET_CLOCK       = 0x08,
  SET_BIO         = 0x40,
  GET_BIO         = 0x41,
}

export enum BedJetButton {
  OFF             = 0x01,
  COOL            = 0x02,
  HEAT            = 0x03,
  TURBO           = 0x04,
  DRY             = 0x05,
  EXTENDED_HEAT   = 0x06,
  M1              = 0x20,
  M2              = 0x21,
  M3              = 0x22,
  DEBUG_ON        = 0x40,
  DEBUG_OFF       = 0x41,
  CONNECTION_TEST = 0x42,
  UPDATE_FIRMWARE = 0x43,
  LED_ON          = 0x46,
  LED_OFF         = 0x47,
  MUTE            = 0x48,
  UNMUTE          = 0x49,
  NOTIFY_ACK      = 0x52,
  BIORHYTHM_1     = 0x80,
  BIORHYTHM_2     = 0x81,
  BIORHYTHM_3     = 0x82,
}

export const OPERATING_MODE_BUTTON_MAP: Record<OperatingMode, BedJetButton> = {
  [OperatingMode.STANDBY]:       BedJetButton.OFF,
  [OperatingMode.HEAT]:          BedJetButton.HEAT,
  [OperatingMode.TURBO]:         BedJetButton.TURBO,
  [OperatingMode.EXTENDED_HEAT]: BedJetButton.EXTENDED_HEAT,
  [OperatingMode.COOL]:          BedJetButton.COOL,
  [OperatingMode.DRY]:           BedJetButton.DRY,
  [OperatingMode.WAIT]:          BedJetButton.OFF,
};

export enum BioDataRequest {
  DEVICE_NAME       = 0,
  MEMORY_NAMES      = 1,
  BIORHYTHM_NAMES   = 4,
  FIRMWARE_VERSIONS = 32,
}
