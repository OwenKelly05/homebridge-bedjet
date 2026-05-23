import { OperatingMode } from './constants';

export interface BedJetState {
  currentTemperature: number;   // Celsius
  targetTemperature: number;    // Celsius
  operatingMode: OperatingMode;
  fanSpeed: number;             // percent 5–100
  ambientTemperature: number;   // Celsius
  hoursRemaining: number;
  minutesRemaining: number;
  secondsRemaining: number;
  turboTimeSeconds: number;
  isConnected: boolean;
  // from direct status read — undefined until first read
  isDualZone?: boolean;
  ledEnabled?: boolean;
  beepsMuted?: boolean;
  connTestPassed?: boolean;
  unitsSetup?: boolean;
  notificationCode?: number;
}

export interface BedJetConfig {
  name: string;
  address: string;        // BLE MAC e.g. "AA:BB:CC:DD:EE:FF"
  scanTimeout?: number;   // seconds (default 30)
}

export const DEFAULT_STATE: BedJetState = {
  currentTemperature: 20,
  targetTemperature: 28,
  operatingMode: OperatingMode.STANDBY,
  fanSpeed: 50,
  ambientTemperature: 20,
  hoursRemaining: 0,
  minutesRemaining: 0,
  secondsRemaining: 0,
  turboTimeSeconds: 0,
  isConnected: false,
};
