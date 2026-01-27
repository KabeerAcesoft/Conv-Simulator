// use main timezones for following lists
/**
 * this is for use in generating the conversation attributes for a synthetic conversation based on the region of the account
 * some randomness baked with weighting in favour of region, and chance of returning close/far TZs
 */

const AU_TIME_ZONES = [
  'Australia/Adelaide',
  'Australia/Brisbane',
  'Australia/Broken_Hill',
  'Australia/Currie',
  'Australia/Darwin',
  'Australia/Eucla',
  'Australia/Hobart',
  'Australia/Lindeman',
  'Australia/Lord_Howe',
  'Australia/Melbourne',
  'Australia/Perth',
  'Australia/Sydney',
  'Australia/ACT',
  'Australia/Canberra',
];

const NZ_TIME_ZONES = [
  'Pacific/Auckland',
  'Pacific/Chatham',
  'Pacific/Fakaofo',
  'Pacific/Fiji',
  'Pacific/Funafuti',
  'Pacific/Kiritimati',
  'Pacific/Majuro',
  'Pacific/Nauru',
  'Pacific/Tarawa',
  'Pacific/Tongatapu',
  'Pacific/Wellington',
  'Pacific/Wallis',
];

const JP_TIME_ZONES = ['Asia/Tokyo', 'Asia/Sapporo', 'Asia/Okinawa', 'Japan'];

const US_TIME_ZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Phoenix',
  'America/Anchorage',
  'America/Adak',
  'Pacific/Honolulu',
  'US/Eastern',
  'US/Central',
  'US/Mountain',
  'US/Pacific',
  'US/Alaska',
  'US/Hawaii',
];

const EU_TIME_ZONES = [
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Moscow',
  'Europe/Athens',
  'Europe/Brussels',
  'Europe/Bucharest',
  'Europe/Copenhagen',
  'Europe/Helsinki',
  'Europe/Istanbul',
  'Europe/Madrid',
  'Europe/Oslo',
  'Europe/Prague',
  'Europe/Riga',
  'Europe/Rome',
  'Europe/Sofia',
  'Europe/Stockholm',
];

const SEA_TIME_ZONES = [
  'Asia/Bangkok',
  'Asia/Jakarta',
  'Asia/Singapore',
  'Asia/Kuala_Lumpur',
  'Asia/Manila',
  'Asia/Ho_Chi_Minh',
  'Asia/Phnom_Penh',
  'Asia/Vientiane',
  'Asia/Brunei',
  'Asia/Makassar',
  'Asia/Pontianak',
  'Asia/Dili',
  'Asia/Yangon',
  'Asia/Bangkok',
  'Asia/Saigon',
  'Asia/Hovd',
  'Asia/Hong_Kong',
  'Asia/Macau',
];

const getRandomTimezone = (timezones: string[]) => {
  // eslint-disable-next-line sonarjs/pseudo-random
  return timezones[Math.floor(Math.random() * timezones.length)];
};

type ZoneConfig = { threshold: number; zones: string[] }[];

const ZONE_CONFIGS: Record<string, ZoneConfig> = {
  z3: [
    { threshold: 0.75, zones: AU_TIME_ZONES },
    { threshold: 0.85, zones: NZ_TIME_ZONES },
    { threshold: 0.9, zones: JP_TIME_ZONES },
    { threshold: 0.95, zones: US_TIME_ZONES },
    { threshold: 1, zones: SEA_TIME_ZONES },
  ],
  z2: [
    { threshold: 0.95, zones: EU_TIME_ZONES },
    { threshold: 1, zones: US_TIME_ZONES },
  ],
  z1: [
    { threshold: 0.85, zones: US_TIME_ZONES },
    { threshold: 0.9, zones: EU_TIME_ZONES },
    { threshold: 0.95, zones: SEA_TIME_ZONES },
    { threshold: 1, zones: AU_TIME_ZONES },
  ],
};

export const returnTZ = (zone: string) => {
  // eslint-disable-next-line sonarjs/pseudo-random
  const random = Math.random();
  // eslint-disable-next-line security/detect-object-injection
  const config = ZONE_CONFIGS[zone];

  if (!config) return undefined;

  const selected = config.find((item) => random < item.threshold);

  return selected ? getRandomTimezone(selected.zones) : undefined;
};
