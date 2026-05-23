import type { CharacteristicValue, PlatformAccessory, Service } from 'homebridge';
import { BedJet } from './bedjet/BedJet';
import { OperatingMode } from './bedjet/constants';
import type { BedJetConfig, BedJetState } from './bedjet/types';
import type { BedJetPlatform } from './platform';

// OperatingMode → CurrentHeatingCoolingState value
const CURRENT_STATE_MAP: Record<OperatingMode, number> = {
  [OperatingMode.STANDBY]:       0, // OFF
  [OperatingMode.HEAT]:          1, // HEAT
  [OperatingMode.TURBO]:         1, // HEAT
  [OperatingMode.EXTENDED_HEAT]: 1, // HEAT
  [OperatingMode.COOL]:          2, // COOL
  [OperatingMode.DRY]:           2, // COOL
  [OperatingMode.WAIT]:          0, // OFF
};

// TargetHeatingCoolingState value → OperatingMode
const TARGET_TO_MODE: Record<number, OperatingMode> = {
  0: OperatingMode.STANDBY,
  1: OperatingMode.HEAT,
  2: OperatingMode.COOL,
  3: OperatingMode.HEAT, // AUTO — fall back to heat
};

export class BedJetAccessory {
  private readonly thermostatService: Service;
  private readonly fanService: Service;
  private readonly bedjet: BedJet;

  // Debounce handles for setter commands
  private tempDebounce: NodeJS.Timeout | null = null;
  private fanDebounce: NodeJS.Timeout | null = null;

  // Optimistic values — held after a set to suppress stale BLE notification bounces
  private pendingTemp: number | null = null;
  private pendingTempTimer: NodeJS.Timeout | null = null;
  private pendingFanSpeed: number | null = null;
  private pendingFanSpeedTimer: NodeJS.Timeout | null = null;
  private pendingMode: number | null = null;
  private pendingModeTimer: NodeJS.Timeout | null = null;

  private setPending<T>(
    value: T,
    store: 'pendingTemp' | 'pendingFanSpeed' | 'pendingMode',
    timer: 'pendingTempTimer' | 'pendingFanSpeedTimer' | 'pendingModeTimer',
    ms = 3000,
  ): void {
    if (this[timer]) {
      clearTimeout(this[timer] as NodeJS.Timeout);
    }
    (this as unknown as Record<string, unknown>)[store] = value;
    (this as unknown as Record<string, unknown>)[timer] = setTimeout(() => {
      (this as unknown as Record<string, unknown>)[store] = null;
    }, ms);
  }

  constructor(
    private readonly platform: BedJetPlatform,
    private readonly accessory: PlatformAccessory,
    private readonly config: BedJetConfig,
  ) {
    const { Service, Characteristic } = platform.api.hap;

    // AccessoryInformation
    const infoService = this.accessory.getService(Service.AccessoryInformation)
      ?? this.accessory.addService(Service.AccessoryInformation);
    infoService
      .setCharacteristic(Characteristic.Manufacturer, 'BedJet')
      .setCharacteristic(Characteristic.Model, 'BedJet 3')
      .setCharacteristic(Characteristic.SerialNumber, config.address);

    // Thermostat service
    this.thermostatService = this.accessory.getService(Service.Thermostat)
      ?? this.accessory.addService(Service.Thermostat, config.name, 'thermostat');

    this.thermostatService.getCharacteristic(Characteristic.TemperatureDisplayUnits)
      .onGet(() => Characteristic.TemperatureDisplayUnits.CELSIUS);

    this.thermostatService.getCharacteristic(Characteristic.CurrentTemperature)
      .onGet(() => this.bedjet.state.currentTemperature);

    this.thermostatService.getCharacteristic(Characteristic.TargetTemperature)
      .setProps({ minValue: 19, maxValue: 43, minStep: 0.5 })
      .onGet(() => this.pendingTemp ?? this.bedjet.state.targetTemperature)
      .onSet((value: CharacteristicValue) => {
        this.setPending(value as number, 'pendingTemp', 'pendingTempTimer');
        if (this.tempDebounce) {
          clearTimeout(this.tempDebounce);
        }
        this.tempDebounce = setTimeout(() => {
          this.bedjet.setTemperature(value as number).catch(err =>
            this.platform.log.error(`[${config.name}] setTemperature failed: ${err}`),
          );
        }, 100);
      });

    this.thermostatService.getCharacteristic(Characteristic.CurrentHeatingCoolingState)
      .onGet(() => CURRENT_STATE_MAP[this.bedjet.state.operatingMode] ?? 0);

    this.thermostatService.getCharacteristic(Characteristic.TargetHeatingCoolingState)
      .onGet(() => {
        const mode = this.bedjet.state.operatingMode;
        if (mode === OperatingMode.STANDBY || mode === OperatingMode.WAIT) return 0;
        if (mode === OperatingMode.COOL || mode === OperatingMode.DRY) return 2;
        return 1; // HEAT / TURBO / EXTENDED_HEAT
      })
      .onSet((value: CharacteristicValue) => {
        this.setPending(value as number, 'pendingMode', 'pendingModeTimer');
        const mode = TARGET_TO_MODE[value as number] ?? OperatingMode.STANDBY;
        this.bedjet.setOperatingMode(mode).catch(err =>
          this.platform.log.error(`[${config.name}] setOperatingMode failed: ${err}`),
        );
      });

    // FanV2 service
    this.fanService = this.accessory.getService(Service.Fanv2)
      ?? this.accessory.addService(Service.Fanv2, `${config.name} Fan`, 'fan');

    this.fanService.getCharacteristic(Characteristic.Active)
      .onGet(() =>
        this.bedjet.state.operatingMode !== OperatingMode.STANDBY
          ? Characteristic.Active.ACTIVE
          : Characteristic.Active.INACTIVE,
      )
      .onSet((value: CharacteristicValue) => {
        // pendingMode: 0=OFF, 1=HEAT (active), used to suppress stale BLE bounce
        const pendingModeValue = value === Characteristic.Active.INACTIVE ? 0 : 1;
        this.setPending(pendingModeValue, 'pendingMode', 'pendingModeTimer');
        if (value === Characteristic.Active.INACTIVE) {
          this.bedjet.setOperatingMode(OperatingMode.STANDBY).catch(err =>
            this.platform.log.error(`[${config.name}] setOperatingMode(STANDBY) failed: ${err}`),
          );
        } else {
          // Only turn on if currently off
          if (this.bedjet.state.operatingMode === OperatingMode.STANDBY) {
            this.bedjet.setOperatingMode(OperatingMode.HEAT).catch(err =>
              this.platform.log.error(`[${config.name}] setOperatingMode(HEAT) failed: ${err}`),
            );
          }
        }
      });

    this.fanService.getCharacteristic(Characteristic.RotationSpeed)
      .setProps({ minValue: 5, maxValue: 100, minStep: 5 })
      .onGet(() => this.pendingFanSpeed ?? this.bedjet.state.fanSpeed)
      .onSet((value: CharacteristicValue) => {
        this.setPending(value as number, 'pendingFanSpeed', 'pendingFanSpeedTimer');
        if (this.fanDebounce) {
          clearTimeout(this.fanDebounce);
        }
        this.fanDebounce = setTimeout(() => {
          this.bedjet.setFanSpeed(value as number).catch(err =>
            this.platform.log.error(`[${config.name}] setFanSpeed failed: ${err}`),
          );
        }, 100);
      });

    // Create BLE client and wire up state change events
    this.bedjet = new BedJet(config, platform.log);

    this.bedjet.on('stateChange', (state: BedJetState) => this._syncHomeKit(state));
    this.bedjet.on('connected', () => {
      // Update FirmwareRevision once we have it
      const fw = this.bedjet.firmware;
      if (fw) {
        infoService.setCharacteristic(Characteristic.FirmwareRevision, fw);
      }
    });

    // Start connecting — errors are logged but don't crash Homebridge
    this.bedjet.connect().catch(err =>
      this.platform.log.error(`[${config.name}] Initial connect failed: ${err}`),
    );
  }

  private _syncHomeKit(state: BedJetState): void {
    const { Characteristic } = this.platform.api.hap;

    // Clamp helper — keeps values within the bounds HomeKit expects
    const clamp = (val: number, min: number, max: number) =>
      Math.min(max, Math.max(min, val));

    // BedJet V3 fixed range: 66°F–109°F = 19–43°C
    const minTemp = 19;
    const maxTemp = 43;

    this.thermostatService.updateCharacteristic(
      Characteristic.CurrentTemperature,
      clamp(state.currentTemperature, -270, 100),
    );

    // Use pending (optimistic) values if set — suppresses stale BLE notification bounces
    const targetTemp = this.pendingTemp ?? clamp(state.targetTemperature, minTemp, maxTemp);
    const fanSpeed   = this.pendingFanSpeed ?? clamp(state.fanSpeed, 5, 100);

    const derivedTargetState =
      state.operatingMode === OperatingMode.STANDBY || state.operatingMode === OperatingMode.WAIT
        ? 0
        : state.operatingMode === OperatingMode.COOL || state.operatingMode === OperatingMode.DRY
          ? 2
          : 1;
    const targetState = this.pendingMode ?? derivedTargetState;

    this.thermostatService.updateCharacteristic(
      Characteristic.TargetTemperature,
      targetTemp,
    );

    this.thermostatService.updateCharacteristic(
      Characteristic.CurrentHeatingCoolingState,
      CURRENT_STATE_MAP[state.operatingMode] ?? 0,
    );

    this.thermostatService.updateCharacteristic(
      Characteristic.TargetHeatingCoolingState,
      targetState,
    );

    this.fanService.updateCharacteristic(
      Characteristic.Active,
      targetState !== 0
        ? Characteristic.Active.ACTIVE
        : Characteristic.Active.INACTIVE,
    );

    this.fanService.updateCharacteristic(
      Characteristic.RotationSpeed,
      fanSpeed,
    );
  }
}
