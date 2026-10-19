export const BRANCH_LINKS = {
  alkapuri: "",
  waghodia: "",
  vasna: "",
};

export function branchMapsUrl(branch) {
  if (!branch) return "";
  const custom = BRANCH_LINKS[String(branch).trim().toLowerCase()];
  if (custom) return custom;
  return (
    "https://www.google.com/maps/search/?api=1&query=" +
    encodeURIComponent(`Aura Laser & Cosmetic Clinic ${branch} Vadodara`)
  );
}
