'use strict';

const { HomebridgePluginUiServer } = require('@homebridge/plugin-ui-utils');
const path = require('path');
const fs   = require('fs');
const os   = require('os');

// node-ble lives one level up in the plugin's own node_modules
const NodeBle = require(path.join(__dirname, '..', 'node_modules', 'node-ble'));
const { createBluetooth } = NodeBle;

const SCAN_DURATION_MS = 12000;

// homebridge-config-ui-x sets UIX_CONFIG_PATH when spawning this child process
function getConfigPath() {
  if (process.env.UIX_CONFIG_PATH) return process.env.UIX_CONFIG_PATH;
  // Common fallback locations
  const candidates = [
    path.join(os.homedir(), '.homebridge', 'config.json'),
    '/var/lib/homebridge/config.json',
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return path.join(os.homedir(), '.homebridge', 'config.json');
}

class BedJetUiServer extends HomebridgePluginUiServer {
  constructor() {
    super();
    this.onRequest('/scan',           this.handleScan.bind(this));
    this.onRequest('/add-device',     this.handleAddDevice.bind(this));
    this.onRequest('/get-devices',    this.handleGetDevices.bind(this));
    this.onRequest('/update-device',  this.handleUpdateDevice.bind(this));
    this.ready();
  }

  // ── BLE scan ────────────────────────────────────────────────────────────────

  async handleScan() {
    let destroy = null;
    const found = [];

    try {
      const ble = createBluetooth();
      destroy = ble.destroy;

      const adapter = await ble.bluetooth.defaultAdapter();
      const wasDiscovering = await adapter.isDiscovering();
      if (!wasDiscovering) await adapter.startDiscovery();

      await new Promise(resolve => setTimeout(resolve, SCAN_DURATION_MS));

      if (!wasDiscovering) await adapter.stopDiscovery().catch(() => {});

      const addresses = await adapter.devices();
      for (const address of addresses) {
        try {
          const device = await adapter.getDevice(address);
          const name   = await device.getName().catch(() => null);
          if (name && name.toUpperCase().includes('BEDJET')) {
            found.push({ name, address });
          }
        } catch { /* skip device */ }
      }
    } catch (err) {
      throw new Error(`Bluetooth scan failed: ${err.message || err}`);
    } finally {
      if (destroy) { try { destroy(); } catch { /* ignore */ } }
    }

    return { devices: found };
  }

  // ── Config write ─────────────────────────────────────────────────────────────

  async handleAddDevice(body) {
    const { name, address, defaultMode, defaultTemperature, defaultFanSpeed } = body || {};

    if (!name || !address) {
      throw new Error('Missing name or address');
    }

    const configPath = getConfigPath();

    let raw;
    try {
      raw = fs.readFileSync(configPath, 'utf8');
    } catch (err) {
      throw new Error(`Cannot read config file (${configPath}): ${err.message}`);
    }

    let config;
    try {
      config = JSON.parse(raw);
    } catch (err) {
      throw new Error(`Config file is not valid JSON: ${err.message}`);
    }

    if (!Array.isArray(config.platforms)) config.platforms = [];

    let platform = config.platforms.find(p => p.platform === 'BedJetPlatform');
    if (!platform) {
      platform = { platform: 'BedJetPlatform', name: 'BedJetPlatform', devices: [] };
      config.platforms.push(platform);
    }
    if (!Array.isArray(platform.devices)) platform.devices = [];

    const addrUp = address.toUpperCase();
    if (platform.devices.some(d => d.address && d.address.toUpperCase() === addrUp)) {
      return { status: 'already_exists' };
    }

    const entry = { name, address, scanTimeout: 30 };
    if (defaultMode)                                       entry.defaultMode        = defaultMode;
    if (defaultTemperature !== undefined && defaultTemperature !== null) entry.defaultTemperature = Number(defaultTemperature);
    if (defaultFanSpeed    !== undefined && defaultFanSpeed    !== null) entry.defaultFanSpeed    = Number(defaultFanSpeed);

    platform.devices.push(entry);

    try {
      fs.writeFileSync(configPath, JSON.stringify(config, null, 4), 'utf8');
    } catch (err) {
      throw new Error(`Cannot write config file: ${err.message}`);
    }

    return { status: 'ok' };
  }

  // ── Read configured devices ───────────────────────────────────────────────

  async handleGetDevices() {
    const configPath = getConfigPath();
    try {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      const platform = (config.platforms || []).find(p => p.platform === 'BedJetPlatform');
      return { devices: (platform && Array.isArray(platform.devices)) ? platform.devices : [] };
    } catch (err) {
      throw new Error(`Cannot read config: ${err.message}`);
    }
  }

  // ── Update defaults for an existing device ────────────────────────────────

  async handleUpdateDevice(body) {
    const { address, defaultMode, defaultTemperature, defaultFanSpeed } = body || {};
    if (!address) throw new Error('Missing address');

    const configPath = getConfigPath();
    let config;
    try {
      config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } catch (err) {
      throw new Error(`Cannot read config: ${err.message}`);
    }

    const platform = (config.platforms || []).find(p => p.platform === 'BedJetPlatform');
    if (!platform) throw new Error('BedJetPlatform not found in config');

    const device = (platform.devices || []).find(
      d => d.address && d.address.toUpperCase() === address.toUpperCase(),
    );
    if (!device) throw new Error('Device not found in config');

    if (defaultMode)                                                  device.defaultMode        = defaultMode;
    else                                                              delete device.defaultMode;
    if (defaultTemperature !== undefined && defaultTemperature !== null && defaultTemperature !== '') {
      device.defaultTemperature = Number(defaultTemperature);
    } else {
      delete device.defaultTemperature;
    }
    if (defaultFanSpeed !== undefined && defaultFanSpeed !== null && defaultFanSpeed !== '') {
      device.defaultFanSpeed = Number(defaultFanSpeed);
    } else {
      delete device.defaultFanSpeed;
    }

    try {
      fs.writeFileSync(configPath, JSON.stringify(config, null, 4), 'utf8');
    } catch (err) {
      throw new Error(`Cannot write config: ${err.message}`);
    }

    return { status: 'ok' };
  }
}

new BedJetUiServer();
