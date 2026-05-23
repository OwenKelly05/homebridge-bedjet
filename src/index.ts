import type { API } from 'homebridge';
import { BedJetPlatform, PLATFORM_NAME, PLUGIN_NAME } from './platform';

export = (api: API) => {
  api.registerPlatform(PLUGIN_NAME, PLATFORM_NAME, BedJetPlatform);
};
