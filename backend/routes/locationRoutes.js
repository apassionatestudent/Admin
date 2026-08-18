// /**
//  * I won't put this into controllers nor models folder since it's just reading from JSON files and returning the data. No database interaction, no complex logic, just simple filtering and mapping. 
//  * So I think it's fine to just keep it as a single router file for now. If we end up adding more location-related endpoints or if the logic gets more complex, then we can consider refactoring into controllers and models. 
//  * But for now, this is straightforward enough to not require that level of abstraction.
//  */

// import express from 'express';
// import { readFileSync } from 'fs'; // => file system module to read JSON files, needed in ES modules since I don't use commonJS.
// import { fileURLToPath } from 'url'; // => path utility functions for working with file paths 
// import { dirname, join } from 'path';

// const __filename = fileURLToPath(import.meta.url); // => Get current file's full path
// const __dirname = dirname(__filename); // => current directory path from the filename

// // => Load location data from JSON files on the backend folder. No database setup needed. 
// const regions  = JSON.parse(readFileSync(join(__dirname, '../regions.json'), 'utf-8'));
// const provinces = JSON.parse(readFileSync(join(__dirname, '../provinces.json'), 'utf-8'));
// const cities   = JSON.parse(readFileSync(join(__dirname, '../cities-municipalities.json'), 'utf-8'));


// const router = express.Router(); // => Express router to handle location-related API endpoints

// // GET /regions => returns list of all regions with their codes and names
// router.get('/regions', (req, res) => {
//   res.json(regions.map(r => ({ code: r.code, name: r.regionName })));
// });

// // GET /provinces/:regionCode => returns list of provinces in the specified region to ensure correctness of data alright! 
// router.get('/provinces/:regionCode', (req, res) => {
//   const filtered = provinces
//     .filter(p => p.regionCode === req.params.regionCode)
//     .map(p => ({ code: p.code, name: p.name }));
//   res.json(filtered);
// });

// // GET /cities/:provinceCode => returns list of cities/municipalities in the specified province
// router.get('/cities/:provinceCode', (req, res) => {
//   const filtered = cities
//     .filter(c => c.provinceCode === req.params.provinceCode)
//     .map(c => ({ code: c.code, name: c.name }));
//   res.json(filtered);
// });

// // => For regions with no provinces (e.g. NCR), fetch cities directly by regionCode
// router.get('/cities-by-region/:regionCode', (req, res) => {
//   const filtered = cities
//     .filter(c => c.regionCode === req.params.regionCode)
//     .map(c => ({ code: c.code, name: c.name }));
//   res.json(filtered);
// });

// // => Load barangays - kept separate due to large file size (10MB+), kept at the bottom to prevent unnecessary loading. 
// const barangays = JSON.parse(readFileSync(join(__dirname, '../barangays.json'), 'utf-8')); 

// // GET /barangays/:cityCode => returns barangays under a specific city/municipality
// // => barangays.json uses cityCode for cities and municipalityCode for municipalities - never both
// // => so we check both fields against the incoming code to cover all cases
// router.get('/barangays/:cityCode', (req, res) => {
//   const code = req.params.cityCode;
//   const filtered = barangays
//     .filter(b => b.cityCode === code || b.municipalityCode === code)
//     .map(b => ({ code: b.code, name: b.name }));
//   res.json(filtered);
// });

// export default router;

/**
 * Location routes - uses psgc.cloud hierarchy endpoints.
 * These are cleaner and more reliable than bulk + prefix matching.
 *
 * Endpoint pattern:
 * GET /api/regions                                     => all regions
 * GET /api/regions/{code}/provinces                    => provinces in a region
 * GET /api/provinces/{code}/cities-municipalities      => cities+municipalities in a province
 * GET /api/regions/{code}/cities-municipalities        => cities+municipalities in a region (NCR)
 * GET /api/v1/barangays?city_code= or municipality_code= => barangays per city
 */
import express from 'express';

const router = express.Router();
const BASE = 'https://psgc.cloud/api';
const Barangays = 'https://psgc.gitlab.io/api/';
const BASE_V1 = 'https://psgc.cloud/api/v1';
const BASE_V2 = 'https://psgc.cloud/api/v2';


// => In-memory cache - regions cached on startup, others cached on first request
let cache = {
  regions: [],
  provincesByRegion: {},    // => keyed by regionCode
  citiesByProvince: {},     // => keyed by provinceCode
  citiesByRegion: {},       // => keyed by regionCode (for NCR)
  barangaysByParent: {},
};

// => PSGC codes are always numeric, 2-10 digits (e.g. "13", "1300000000").
// => Validates req.params BEFORE they're used in outgoing fetch() calls below.
// => Required to fix SSRF (Server-Side Request Forgery) alerts - without this, a user-controlled
// => param flows unsanitized into a server-side fetch URL, which CodeQL flags as a potential
// => vector for forcing our server to make unintended/malicious outbound requests.
const isValidPSGCCode = (code) => /^[0-9]{2,10}$/.test(code);

// => Fetch only regions on startup - small list, stable
export const loadLocationCache = async () => {
  try {
    console.log('Loading regions from psgc.cloud...');
    const regions = await fetch(`${BASE}/regions`).then(r => r.json());
    cache.regions = regions;
    console.log(`Regions loaded - ${regions.length} regions`);
  } catch (err) {
    console.error('Failed to load regions from psgc.cloud:', err);
  }
};

// => Sync lookup, no fetch needed - regions are already cached on startup.
//    Same prefix-matching logic the frontend detail pages use to handle
//    the short-code (psgc.cloud) vs 10-digit (DB) mismatch.
// => Exported so activity-log diffing can resolve a region_code to a
//    readable name without going through HTTP.
export const getRegionName = (regionCode) => {
  const match = cache.regions.find(r =>
    regionCode === r.code ||
    regionCode.startsWith(r.code) ||
    r.code.startsWith(regionCode)
  );
  return match?.name ?? regionCode;
};

// GET /regions
router.get('/regions', (req, res) => {
  res.json(cache.regions.map(r => ({ code: r.code, name: r.name })));
});

// GET /provinces/:regionCode
// => Uses hierarchy endpoint: /api/regions/{code}/provinces
// GET /provinces/:regionCode
// => Uses hierarchy endpoint: /api/regions/{code}/provinces
// => Extracted so other backend modules (activity-log diffing) can reuse
//    this without an HTTP round trip to this router's own route.
export const getProvinces = async (regionCode) => {
  if (!isValidPSGCCode(regionCode)) return [];

  if (cache.provincesByRegion[regionCode]) {
    return cache.provincesByRegion[regionCode];
  }

  const regionEntry = cache.regions.find(r =>
    regionCode === r.code ||
    regionCode.startsWith(r.code) ||
    r.code.startsWith(regionCode)
  );
  const shortCode = regionEntry?.code ?? regionCode;

  try {
    const data = await fetch(`${BASE}/regions/${shortCode}/provinces`)
      .then(r => r.json());

    const mapped = (Array.isArray(data) ? data : [])
      .map(p => ({ code: p.code, name: p.name }))
      .sort((a, b) => a.name.localeCompare(b.name));

    cache.provincesByRegion[regionCode] = mapped;
    return mapped;
  } catch (err) {
    console.error('Failed to fetch provinces:', err);
    return [];
  }
};

router.get('/provinces/:regionCode', async (req, res) => {
  const regionCode = req.params.regionCode;
  if (!isValidPSGCCode(regionCode)) {
    return res.status(400).json({ error: 'Invalid region code' });
  }
  res.json(await getProvinces(regionCode));
});

// GET /cities/:provinceCode
// => Uses hierarchy endpoint: /api/provinces/{code}/cities-municipalities
export const getCitiesByProvince = async (provinceCode) => {
  if (!isValidPSGCCode(provinceCode)) return [];

  if (cache.citiesByProvince[provinceCode]) {
    return cache.citiesByProvince[provinceCode];
  }

  try {
    const data = await fetch(`${BASE}/provinces/${provinceCode}/cities-municipalities`)
      .then(r => r.json());

    const mapped = (Array.isArray(data) ? data : [])
      .map(c => ({
        code: c.code,
        name: c.name,
        zip: c.zip_code || '',
        district: c.district || '',
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    cache.citiesByProvince[provinceCode] = mapped;
    return mapped;
  } catch (err) {
    console.error('Failed to fetch cities:', err);
    return [];
  }
};

router.get('/cities/:provinceCode', async (req, res) => {
  const provinceCode = req.params.provinceCode;
  if (!isValidPSGCCode(provinceCode)) {
    return res.status(400).json({ error: 'Invalid province code' });
  }
  res.json(await getCitiesByProvince(provinceCode));
});

// GET /cities-by-region/:regionCode
// => Uses hierarchy endpoint: /api/regions/{code}/cities-municipalities (for NCR)
// GET /cities-by-region/:regionCode
export const getCitiesByRegion = async (regionCode) => {
  if (!isValidPSGCCode(regionCode)) return [];

  if (cache.citiesByRegion[regionCode]) {
    return cache.citiesByRegion[regionCode];
  }

  const regionEntry = cache.regions.find(r =>
    regionCode === r.code ||
    regionCode.startsWith(r.code) ||
    r.code.startsWith(regionCode)
  );
  const shortCode = regionEntry?.code ?? regionCode;

  try {
    const data = await fetch(`${BASE}/regions/${shortCode}/cities-municipalities`)
      .then(r => r.json());

    const mapped = (Array.isArray(data) ? data : [])
      .map(c => ({
        code: c.code,
        name: c.name,
        zip: c.zip_code || '',
        district: c.district || '',
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    cache.citiesByRegion[regionCode] = mapped;
    return mapped;
  } catch (err) {
    console.error('Failed to fetch region cities:', err);
    return [];
  }
};

router.get('/cities-by-region/:regionCode', async (req, res) => {
  const regionCode = req.params.regionCode;
  if (!isValidPSGCCode(regionCode)) {
    return res.status(400).json({ error: 'Invalid region code' });
  }
  res.json(await getCitiesByRegion(regionCode));
});

// GET /barangays/:cityCode
// => v1 API: try city_code first, fallback to municipality_code
// router.get('/barangays/:cityCode', async (req, res) => {
//   const code = req.params.cityCode;

//   try {
//     // // => Try city_code first
//     // let response = await fetch(`${BASE}/barangays?city_code=${code}&per_page=200`);
//     // let data = await response.json();
//     // let barangays = Array.isArray(data) ? data : (data.data || []);

//     // // => If empty, try municipality_code
//     // if (barangays.length === 0) {
//     //   response = await fetch(`${BASE}/barangays?municipality_code=${code}&per_page=200`);
//     //   data = await response.json();
//     //   barangays = Array.isArray(data) ? data : (data.data || []);
//     // }

//     // => Try city_code first
//     let response = await fetch(`${Barangays}cities/${code}/barangays/`);
//     let data = await response.json();
//     let barangays = Array.isArray(data) ? data : (data.data || []);

//     // // => If empty, try municipality_code
//     // if (barangays.length === 0) {
//     //   response = await fetch(`${Barangays}municipalities/?municipalityCode=${code}/barangays`);
//     //   data = await response.json();
//     //   barangays = Array.isArray(data) ? data : (data.data || []);
//     // }

//     res.json(barangays.map(b => ({ code: b.code, name: b.name })));
//   } catch (err) {
//     console.error(`Failed to fetch barangays for ${code}:`, err);
//     res.json([]);
//   }
// });

// GET /barangays/:cityCode
// => Uses psgc.cloud hierarchy: /api/cities/{code}/barangays or /api/municipalities/{code}/barangays
// => psgc.cloud codes are 10 digits - no conversion needed, use them directly
export const getBarangays = async (code) => {
  if (!isValidPSGCCode(code)) return [];

  if (cache.barangaysByParent[code]) {
    return cache.barangaysByParent[code];
  }

  try {
    let response = await fetch(`${BASE}/cities/${code}/barangays`);

    if (!response.ok) {
      response = await fetch(`${BASE}/municipalities/${code}/barangays`);
    }

    if (!response.ok) {
      console.warn(`Barangays not found on psgc.cloud for code ${code}`);
      return [];
    }

    const data = await response.json();
    const mapped = (Array.isArray(data) ? data : [])
      .map(b => ({ code: b.code, name: b.name }))
      .sort((a, b) => a.name.localeCompare(b.name));

    cache.barangaysByParent[code] = mapped;
    return mapped;

  } catch (err) {
    console.error(`Failed to fetch barangays for ${code}:`, err);
    return [];
  }
};

router.get('/barangays/:cityCode', async (req, res) => {
  const code = req.params.cityCode;
  if (!isValidPSGCCode(code)) {
    return res.status(400).json({ error: 'Invalid city code' });
  }
  res.json(await getBarangays(code));
});

// GET /barangays/:cityCode
// => psgc.cloud separates city_code and municipality_code - try both in parallel
// => whichever returns data wins; the other will be empty
// router.get('/barangays/:cityCode', async (req, res) => {
//   const code = req.params.cityCode;

//   try {
//     const [cityResult, munResult] = await Promise.all([
//       fetch(`${BASE_V2}/barangays?city_code=${code}&per_page=500`).then(r => r.json()),
//       fetch(`${BASE_V2}/barangays?municipality_code=${code}&per_page=500`).then(r => r.json()),
//     ]);

//     const cityBarangays = Array.isArray(cityResult) ? cityResult : (cityResult.data || []);
//     const munBarangays  = Array.isArray(munResult)  ? munResult  : (munResult.data  || []);

//     // => Use whichever returned data; merge in case both somehow return results
//     const merged = [...cityBarangays, ...munBarangays];
//     res.json(merged.map(b => ({ code: b.code, name: b.name }))
//       .sort((a, b) => a.name.localeCompare(b.name)));
//   } catch (err) {
//     console.error(`Failed to fetch barangays for ${code}:`, err);
//     res.json([]);
//   }
// });

export default router;