// Curated SMS markets approved for display in the customer marketplace.
// Exact inventory is still checked live before a number is shown or sold.
const countryCodes = ["US", "GB", "CA", "AU", "ZA", "NL", "FI", "SE"] as const;

const pinned = ["US", "GB", "CA", "AU", "ZA", "NL", "FI", "SE"];
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
