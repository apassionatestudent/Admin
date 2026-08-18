// => admin/utils/resolveAddressNames.js
// => Resolves PSGC address codes to human-readable names for activity log
//    diffs. Calls the same exported functions locationRoutes.js exposes to
//    the frontend, directly in-process - no HTTP round trip to the
//    server's own routes, since both run in the same backend.

import { getRegionName, getProvinces, getCitiesByProvince, getCitiesByRegion, getBarangays } from '../routes/locationRoutes.js';

const normalize = (value) => {
  if (value === null || value === undefined) return '';
  return String(value).trim();
};

// => Resolves one address's four codes into readable names. Falls back to
//    the raw code if a name can't be resolved (e.g. psgc.cloud is down) -
//    never throws, a broken name lookup shouldn't block the actual save.
export const resolveAddressNames = async ({ region_code, province_code, city_code, barangay_code }) => {
  const names = { region: '', province: '', city: '', barangay: '' };
  if (!region_code) return names;

  try {
    names.region = getRegionName(region_code) || region_code;

    if (province_code) {
      const provinces = await getProvinces(region_code);
      names.province = provinces.find(p => p.code === province_code)?.name ?? province_code;
    }

    if (city_code) {
      const cities = province_code
        ? await getCitiesByProvince(province_code)
        : await getCitiesByRegion(region_code);
      names.city = cities.find(c => c.code === city_code)?.name ?? city_code;
    }

    if (barangay_code && city_code) {
      const barangays = await getBarangays(city_code);
      names.barangay = barangays.find(b => b.code === barangay_code)?.name ?? barangay_code;
    }
  } catch (err) {
    console.error('resolveAddressNames failed (non-fatal):', err);
  }

  return names;
};

// => Address-specific diff using resolved names instead of raw PSGC
//    codes. oldAddress/newFields are the raw student_address shape
//    (region_code/province_code/city_code/barangay_code/street).
export const buildAddressDiff = async (oldAddress, newFields) => {
  const changes = [];

  const oldStreet = normalize(oldAddress?.street);
  const newStreet = normalize(newFields.street);
  if ('street' in newFields && oldStreet !== newStreet) {
    changes.push(`Street: "${oldStreet || '-'}" -> "${newStreet || '-'}"`);
  }

  // => Only resolve names if a location code actually changed - avoids
  //    four unnecessary API calls on a street-only edit
  const locationFieldsChanged = ['region_code', 'province_code', 'city_code', 'barangay_code']
    .some(key => key in newFields && normalize(oldAddress?.[key]) !== normalize(newFields[key]));

  if (locationFieldsChanged) {
    const mergedNew = { ...oldAddress, ...newFields };
    const [oldNames, newNames] = await Promise.all([
      resolveAddressNames(oldAddress || {}),
      resolveAddressNames(mergedNew),
    ]);

    if (oldNames.region !== newNames.region) {
      changes.push(`Region: "${oldNames.region || '-'}" -> "${newNames.region || '-'}"`);
    }
    if (oldNames.province !== newNames.province) {
      changes.push(`Province: "${oldNames.province || '-'}" -> "${newNames.province || '-'}"`);
    }
    if (oldNames.city !== newNames.city) {
      changes.push(`City/Municipality: "${oldNames.city || '-'}" -> "${newNames.city || '-'}"`);
    }
    if (oldNames.barangay !== newNames.barangay) {
      changes.push(`Barangay: "${oldNames.barangay || '-'}" -> "${newNames.barangay || '-'}"`);
    }
  }

  return changes;
};