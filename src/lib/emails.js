export const isPlaceholderEmail = (e) => {
  if (!e) return true;
  const str = String(e).trim().toLowerCase();
  return (
    str === "" ||
    str.startsWith("noemail") ||
    str.includes("noemail+") ||
    str.endsWith("@sms.cal.com") ||
    str.endsWith("@cal.com") ||
    str.endsWith("@patient.auraclinic.in") ||
    /^noemail\+.*@auralaser\.co\.in$/i.test(str)
  );
};

export const cleanEmail = (e) => (isPlaceholderEmail(e) ? "" : String(e).trim());
