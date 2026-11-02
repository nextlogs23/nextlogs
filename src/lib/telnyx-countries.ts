// Telnyx international numbering coverage. Inventory and SMS capability are
// still checked live before any number is shown or offered for purchase.
const countryCodes = [
  "AL", "DZ", "AO", "AI", "AG", "AR", "AM", "AU", "AT", "BS", "BD", "BB",
  "BE", "BZ", "BJ", "BM", "BO", "BA", "BW", "BR", "VG", "BN", "BG", "BF",
  "KH", "CM", "CA", "KY", "CL", "CN", "CO", "CR", "HR", "CW", "CY", "CZ",
  "DK", "DM", "DO", "EC", "EG", "SV", "EE", "ET", "FI", "FR", "GF", "GE",
  "DE", "GH", "GR", "GD", "GP", "GT", "HN", "HK", "HU", "IS", "ID", "IE",
  "IL", "IT", "JM", "JP", "JO", "KZ", "KE", "KW", "KG", "LV", "LB", "LT",
  "LU", "MO", "MK", "MY", "MT", "MQ", "MU", "YT", "MX", "MD", "MC", "ME",
  "MA", "MM", "NP", "NL", "NZ", "NI", "NG", "NO", "OM", "PK", "PA", "PY",
  "PE", "PH", "PL", "PT", "PR", "QA", "RE", "RO", "KN", "LC", "VC", "SA",
  "RS", "SC", "SG", "SK", "SI", "ZA", "KR", "ES", "LK", "SE", "CH", "TW",
  "TZ", "TH", "TT", "TN", "TC", "UG", "UA", "AE", "GB", "US", "UY", "VI",
  "VE", "VN", "ZW",
] as const;

const pinned = ["US", "GB", "CA", "AU", "DE", "FR", "NL", "IE", "ZA", "NG"];
const displayNames = new Intl.DisplayNames(["en"], { type: "region" });

function flagFor(code: string) {
  return String.fromCodePoint(...[...code].map((letter) => 127397 + letter.charCodeAt(0)));
}

export const telnyxCountries = countryCodes.map((code) => ({
  code,
  name: displayNames.of(code) || code,
  flag: flagFor(code),
  dial: `ISO ${code}`,
})).sort((left, right) => {
  const leftPinned = pinned.indexOf(left.code);
  const rightPinned = pinned.indexOf(right.code);
  if (leftPinned >= 0 || rightPinned >= 0) {
    if (leftPinned < 0) return 1;
    if (rightPinned < 0) return -1;
    return leftPinned - rightPinned;
  }
  return left.name.localeCompare(right.name);
});
