import type { API, DynamicPlatformPlugin, Logging, PlatformAccessory, PlatformConfig } from 'homebridge';
import { BedJetAccessory } from './accessory';
import type { BedJetConfig } from './bedjet/types';
import { sanitizeName } from './utils';

export const PLATFORM_NAME = 'BedJetPlatform';
export const PLUGIN_NAME   = 'homebridge-bedjet';

export class BedJetPlatform implements DynamicPlatformPlugin {
  private readonly accessories: Map<string, PlatformAccessory> = new Map();
  private readonly discoveredUUIDs: string[] = [];

  constructor(
    public readonly log: Logging,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    this.log.debug('BedJetPlatform initializing');

    this.api.on('didFinishLaunching', () => {
      this.log.debug('didFinishLaunching');
      this.discoverDevices();
    });
  }

  configureAccessory(accessory: PlatformAccessory): void {
    this.log.info('Loading accessory from cache:', accessory.displayName);
    this.accessories.set(accessory.UUID, accessory);
  }

  private discoverDevices(): void {
    const devices: BedJetConfig[] = this.config['devices'] ?? [];

    if (devices.length === 0) {
      this.log.warn('No BedJet devices configured. Add at least one device in the plugin settings.');
      return;
    }

    for (const device of devices) {
      if (!device.address) {
        this.log.warn(`Skipping device "${device.name}" — no address configured`);
        continue;
      }

      const uuid = this.api.hap.uuid.generate(device.address.toLowerCase());
      this.discoveredUUIDs.push(uuid);

      const existing = this.accessories.get(uuid);
      const safeName = sanitizeName(device.name);

      if (existing) {
        this.log.info('Restoring existing accessory from cache:', existing.displayName);
        existing.context.device = device;
        // Update the display name in case the config name changed or was invalid
        existing.displayName = safeName;
        this.api.updatePlatformAccessories([existing]);
        new BedJetAccessory(this, existing, device);
      } else {
        this.log.info('Adding new accessory:', safeName);
        const accessory = new this.api.platformAccessory(safeName, uuid);
        accessory.context.device = device;
        new BedJetAccessory(this, accessory, device);
        this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      }
    }

    // Remove accessories that are no longer in the config
    for (const [uuid, accessory] of this.accessories) {
      if (!this.discoveredUUIDs.includes(uuid)) {
        this.log.info('Removing stale accessory from cache:', accessory.displayName);
        this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      }
    }
  }
}
